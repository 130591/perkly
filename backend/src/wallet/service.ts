import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { WalletRepository, ChargeRepository, LedgerRepository } from './database'
import { PaymentRail, PAYMENT_RAIL } from '../settle/payment-rail'
import { Ledger } from './domain/ledger'

type ChargeDto = {
  method: 'pix' | 'boleto',
  amount: bigint,
  accountId: string,
  idempotencyKey: string
}

@Injectable()
export class Wallet {
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
 
  async findBalances(accountId: string) {
    const wallet = await this.walletRepo.findByAccountId(accountId)
    if (!wallet) throw new NotFoundException('Wallet not found')
    const balance = await this.ledgerRepo.loadBalances(accountId)
    return Ledger.hydrate(balance).summary()
  }

  @Transactional()
  async confirmBalance(pspChargeId: string) {
    const charge = await this.chargeRepo.findByPspChargeId(pspChargeId)
    if (!charge) throw new NotFoundException('Charge not found')
    if (charge.status === 'PAID') return // idempotent: already settled

    const accountId = await this.walletRepo.findAccountId(charge.walletId)
    if (!accountId) throw new NotFoundException('Wallet account not found')

    const ledger = Ledger.hydrate(await this.ledgerRepo.loadBalances(accountId))
    const transaction = ledger.fund(BigInt(charge.amountCents))

    const transactionId = await this.ledgerRepo.append(charge.walletId, transaction)
    await this.chargeRepo.markPaid(charge.id, transactionId)
    await this.walletRepo.applyCredit(charge.walletId, charge.amountCents)
  }
}
