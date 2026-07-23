import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { WalletRepository, ChargeRepository, LedgerRepository } from './database'
import { PaymentRail, PAYMENT_RAIL } from '../settle/payment-rail'
import { CashInConfirmed } from '../settle/rail-events'
import { BalanceReservation, ReleaseBalance, ReserveBalance } from './balance-reservation'
import { Ledger } from './domain/ledger'

type ChargeDto = {
  method: 'pix' | 'boleto',
  amount: bigint,
  accountId: string,
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

    const wallet = await this.walletRepo.findByAccountIdForUpdate(input.accountId)
    if (!wallet) throw new NotFoundException('Wallet not found')
    const ledger = Ledger.hydrate(await this.ledgerRepo.loadBalances(input.accountId))
    const transaction = ledger.reserve(input.amountCents)
    await this.ledgerRepo.append(wallet.id, transaction)
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

    const wallet = await this.walletRepo.findByAccountIdForUpdate(input.accountId)
    if (!wallet) throw new NotFoundException('Wallet not found')
    const ledger = Ledger.hydrate(await this.ledgerRepo.loadBalances(input.accountId))
    const transaction = ledger.expire(input.amountCents)
    await this.ledgerRepo.append(wallet.id, transaction)
  }

  async findBalances(accountId: string) {
    const wallet = await this.walletRepo.findByAccountId(accountId)
    if (!wallet) throw new NotFoundException('Wallet not found')
    const balance = await this.ledgerRepo.loadBalances(accountId)
    return Ledger.hydrate(balance).summary()
  }

  @Transactional()
  async confirmBalance(event: CashInConfirmed) {
    const charge = await this.chargeRepo.findByIdempotencyKeyForUpdate(event.reference)
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
    const transactionId = await this.ledgerRepo.append(charge.walletId, transaction)
    await this.chargeRepo.markPaid(charge.id, transactionId)
    await this.walletRepo.applyCredit(charge.walletId, event.amountCents.toString())
  }
}
