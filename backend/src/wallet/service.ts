import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import {
  WalletRepository,
  ChargeRepository,
  LedgerRepository,
} from './database'
import { PaymentRail, PAYMENT_RAIL } from '../settle/payment-rail'
import { CashInConfirmed } from '../settle/rail-events'
import {
  BalanceReservation,
  ReleaseBalance,
  ReserveBalance,
  SettleBalance,
} from './balance-reservation'
import { Ledger } from './domain/ledger'

type ChargeDto = {
  method: 'pix' | 'boleto'
  amount: bigint
  accountId: string
  idempotencyKey: string
}

@Injectable()
export class Wallet implements BalanceReservation {
  private readonly logger = new Logger(Wallet.name)

  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly chargeRepo: ChargeRepository,
    private readonly ledgerRepo: LedgerRepository,
    @Inject(PAYMENT_RAIL) private readonly rail: PaymentRail,
  ) {}

  async addBalance(input: ChargeDto) {
    const wallet = await this.walletRepo.findByAccountId(input.accountId)
    if (!wallet) throw new NotFoundException('Client Wallet not found')
    const charge = await this.rail.charge({
      amountCents: input.amount,
      method: input.method,
      reference: input.idempotencyKey,
    })
    await this.chargeRepo.create({
      walletId: wallet.id,
      method: input.method,
      idempotencyKey: input.idempotencyKey,
      charge,
    })
    return charge
  }

  /**
   * Read-model for the client to poll while a charge is pending — the client
   * already holds `idempotencyKey` (it generated it), so no extra id needs to
   * round-trip through `addBalance`'s response. Scoped to `accountId` so
   * polling can't be used to probe another tenant's charges.
   */
  async getChargeStatus(accountId: string, idempotencyKey: string) {
    const wallet = await this.walletRepo.findByAccountId(accountId)
    if (!wallet) throw new NotFoundException('Wallet not found')

    const charge = await this.chargeRepo.findByIdempotencyKey(idempotencyKey)
    if (!charge || charge.walletId !== wallet.id)
      throw new NotFoundException('Charge not found')

    return { status: charge.status, expiresAt: charge.expiresAt }
  }

  /**
   * Compromete saldo (available → reserved) para um consumidor externo (ex.: a
   * confirmação de uma campanha). Porta pública `BalanceReservation`: o chamador
   * fala vocabulário de domínio; o ledger e o overdraft-guard ficam aqui dentro.
   *
   * Reivindica a chave de idempotência antes de travar a linha (reentrega
   * retorna rápido, sem esperar lock); o `FOR UPDATE` em
   * `findByAccountIdForUpdate` serializa concorrentes na mesma conta, fechando
   * a janela de leitura-e-decide que `loadBalances` sozinho não fecha. Se
   * `ledger.reserve` lançar por saldo insuficiente, a tx inteira reverte —
   * inclusive o claim da chave — então uma tentativa recusada pode ser
   * retentada depois.
   */
  @Transactional()
  async reserve(input: ReserveBalance): Promise<void> {
    const claimed = await this.walletRepo.claimOperation(input.idempotencyKey)
    if (!claimed) return

    const wallet = await this.walletRepo.findByAccountIdForUpdate(
      input.accountId,
    )
    if (!wallet) throw new NotFoundException('Wallet not found')
    const ledger = Ledger.hydrate(
      await this.ledgerRepo.loadBalances(input.accountId),
    )
    const transaction = ledger.reserve(input.amountCents)
    await this.ledgerRepo.append(wallet.id, transaction, input.idempotencyKey)
  }

  /**
   * Devolve saldo comprometido (reserved → available) para um consumidor
   * externo (ex.: um payout que expirou sem resgate). Espelha `reserve`,
   * mesma proteção de idempotência e lock.
   */
  @Transactional()
  async release(input: ReleaseBalance): Promise<void> {
    const claimed = await this.walletRepo.claimOperation(input.idempotencyKey)
    if (!claimed) return

    const wallet = await this.walletRepo.findByAccountIdForUpdate(
      input.accountId,
    )
    if (!wallet) throw new NotFoundException('Wallet not found')
    const ledger = Ledger.hydrate(
      await this.ledgerRepo.loadBalances(input.accountId),
    )
    const transaction = ledger.expire(input.amountCents)
    await this.ledgerRepo.append(wallet.id, transaction, input.idempotencyKey)
  }

  /**
   * Consome saldo comprometido de vez (reserved → external + revenue) para um
   * consumidor externo (ex.: o payout, quando o PSP confirma o Pix ao
   * recipient). Espelha `reserve`/`release`, mesma proteção de idempotência e
   * lock.
   */
  @Transactional()
  async settle(input: SettleBalance): Promise<void> {
    const claimed = await this.walletRepo.claimOperation(input.idempotencyKey)
    if (!claimed) return

    const wallet = await this.walletRepo.findByAccountIdForUpdate(
      input.accountId,
    )
    if (!wallet) throw new NotFoundException('Wallet not found')
    const ledger = Ledger.hydrate(
      await this.ledgerRepo.loadBalances(input.accountId),
    )
    const transaction = ledger.settle(input.amountCents, input.fee)
    await this.ledgerRepo.append(wallet.id, transaction, input.idempotencyKey)
  }

  async findBalances(accountId: string) {
    const wallet = await this.walletRepo.findByAccountId(accountId)
    if (!wallet) throw new NotFoundException('Wallet not found')
    const balance = await this.ledgerRepo.loadBalances(accountId)
    return Ledger.hydrate(balance).summary()
  }

  /**
   * Read-model for the extract screen — facts only, one row per real
   * transaction. No labels, no wording, no grouping: which text a `type`
   * maps to, whether `campaignName: null` reads as "campanha removida", and
   * whether same-day expirations get rolled into one line are presentation
   * decisions that belong to whoever is rendering this, not to the API
   * (a second client could want different copy, another language, or no
   * rollup at all). `amountCents` is the one thing worth computing here: its
   * sign already reflects the ledger's double-entry legs (see the SQL file's
   * comment on why a naive SUM can't do this) so callers don't need to know
   * which account each `type` debits.
   */
  async listLedger(accountId: string) {
    const rows = await this.ledgerRepo.listEntries(accountId)
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      chargeMethod: row.chargeMethod,
      campaignName: row.campaignName,
      amountCents:
        row.type === 'settle' ? row.reservedDelta : row.availableDelta,
      createdAt: row.createdAt,
    }))
  }

  @Transactional()
  async confirmBalance(event: CashInConfirmed) {
    const charge = await this.chargeRepo.findByIdempotencyKeyForUpdate(
      event.reference,
    )
    if (!charge) throw new NotFoundException('Charge not found')
    if (charge.status === 'PAID') return

    const accountId = await this.walletRepo.findAccountId(charge.walletId)
    if (!accountId) throw new NotFoundException('Wallet account not found')

    const expected = BigInt(charge.amountCents)
    if (event.amountCents !== expected) {
      this.logger.warn(
        `Cash-in amount mismatch for ${event.reference}: ` +
          `confirmed ${event.amountCents} vs expected ${expected}; crediting confirmed`,
      )
    }

    const ledger = Ledger.hydrate(await this.ledgerRepo.loadBalances(accountId))
    const transaction = ledger.fund(event.amountCents, event.confirmedAt)
    const transactionId = await this.ledgerRepo.append(
      charge.walletId,
      transaction,
    )
    await this.chargeRepo.markPaid(charge.id, transactionId)
    await this.walletRepo.applyCredit(
      charge.walletId,
      event.amountCents.toString(),
    )
  }
}
