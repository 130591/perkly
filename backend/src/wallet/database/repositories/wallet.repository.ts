import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../core/typeorm'
import { WalletEntity } from '../entities/wallet.entity'

@Injectable()
export class WalletRepository extends DefaultTypeOrmRepository<WalletEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(WalletEntity, dataSource.manager)
  }

  findByAccountId(accountId: string): Promise<WalletEntity | null> {
    return this.findOne({
      where: { account: { externalId: accountId } },
      relations: { account: true },
    })
  }

  async findAccountId(walletId: number): Promise<string | null> {
    const wallet = await this.findOne({
      where: { id: walletId },
      relations: { account: true },
    })
    return wallet?.account?.externalId ?? null
  }

  /** Atomic credit; `amountCents` is a trusted numeric (bigint) string. */
  applyCredit(id: number, amountCents: string): Promise<unknown> {
    return this.update(id, { balance: () => `balance + ${amountCents}` })
  }
}
