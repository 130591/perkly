import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../../database/core/typeorm'
import { WalletEntity } from '../entities/wallet.entity'
import { BalanceOperationEntity } from '../entities/balance-operation.entity'

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

  /**
   * Mesma busca de `findByAccountId`, mas com `SELECT ... FOR UPDATE` — usada
   * por operações que decidem com base no saldo atual (reserve/release), pra
   * serializar concorrentes na mesma conta. Precisa rodar dentro de
   * `@Transactional()`. Mesmo padrão de
   * `ChargeRepository.findByIdempotencyKeyForUpdate`.
   */
  findByAccountIdForUpdate(accountId: string): Promise<WalletEntity | null> {
    return this.findOne({
      where: { account: { externalId: accountId } },
      relations: { account: true },
      lock: { mode: 'pessimistic_write' },
    })
  }

  /**
   * Reivindica uma chave de idempotência pra reserve()/release(). `INSERT ...
   * ON CONFLICT DO NOTHING RETURNING`: `true` se esta chamada inseriu (dona
   * do processamento), `false` se a chave já existia (reentrega → no-op).
   * Mesmo padrão de `PayoutRepository.claimPage`.
   */
  async claimOperation(idempotencyKey: string): Promise<boolean> {
    const result = await this.manager
      .createQueryBuilder()
      .insert()
      .into(BalanceOperationEntity)
      .values({ idempotencyKey })
      .orIgnore()
      .returning('idempotency_key')
      .execute()
    return result.raw.length > 0
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
