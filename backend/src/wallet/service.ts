import { Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { WalletRepository } from './database/repositories'
import { ChargeRepository } from './database/repositories'
import { LedgerRepository } from './database/repositories'
import { Psp } from '../settle/psp'
import { Config } from './config'
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
    private readonly psp: Psp,
    private readonly config: Config,
  ) {}

  async addBalance(input: ChargeDto) {
    const wallet = await this.walletRepo.findByAccountId(input.accountId)
    if (!wallet) throw new NotFoundException('Client Wallet not found')
    const charge = await this.psp.charge(input.amount, input.method)
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
    const available = balance.available ?? 0n
    const reserved = balance.reserved ?? 0n
    const total = available + reserved
    
    return {
      available:available.toString(),
      reserved: reserved.toString(),
      total: total.toString()
    }
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
