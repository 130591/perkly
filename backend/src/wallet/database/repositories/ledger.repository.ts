import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager } from 'typeorm'
import { DefaultTypeOrmRepository } from '../core/typeorm'
import { Account, Ledger, Transaction, TransactionProps } from '../../domain/ledger'
import { WalletEntity } from '../entities/wallet.entity'
import { LedgerTransactionEntity } from '../entities/ledger-transaction.entity'
import { LedgerEntryEntity } from '../entities/ledger-entry.entity'

@Injectable()
export class LedgerRepository extends DefaultTypeOrmRepository<LedgerTransactionEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(LedgerTransactionEntity, dataSource.manager)
  }

  async findEntries(accountId: string): Promise<Ledger> {
    const rows = await ledgerEntriesByTransaction(this.manager, accountId)
    const byTransaction = new Map<string, TransactionProps>()

    for (const row of rows) {
      let transaction = byTransaction.get(row.transaction_id)
      if (!transaction) {
        transaction = {
          id: row.transaction_id,
          type: row.type,
          timestamp: row.timestamp,
          entries: [],
        }
        byTransaction.set(row.transaction_id, transaction)
      }

      transaction.entries.push({
        account: row.account as Account,
        value: BigInt(row.amount),
      })
    }

    return Ledger.hydrate([...byTransaction.values()])
  }

  /** Persists a domain transaction (with its entries) and returns its DB id. */
  async append(walletId: number, transaction: Transaction): Promise<number> {
    const saved = await this.save(
      new LedgerTransactionEntity({
        externalId: transaction.props.id,
        walletId,
        type: transaction.props.type,
        createdAt: transaction.props.timestamp,
        entries: transaction.props.entries.map(
          (entry) =>
            new LedgerEntryEntity({
              account: entry.account,
              amount: entry.value.toString(),
            }),
        ),
      }),
    )
    return saved.id
  }

  protected toDomain(row: any): LedgerTransactionEntity {
    return new LedgerTransactionEntity(row)
  }
}

type LedgerEntryRow = {
  transaction_id: string
  type: TransactionProps['type']
  timestamp: Date
  account: Account
  amount: string
}

function ledgerEntriesByTransaction(
  manager: EntityManager,
  accountId: string,
): Promise<LedgerEntryRow[]> {
  return manager
    .createQueryBuilder(LedgerEntryEntity, 'e')
    .innerJoin('e.transaction', 't')
    .innerJoin(WalletEntity, 'w', 'w.id = t.wallet_id')
    .innerJoin('w.account', 'a')
    .where('a.external_id = :accountId', { accountId })
    .orderBy('t.created_at', 'ASC')
    .addOrderBy('t.id', 'ASC')
    .select('t.external_id', 'transaction_id')
    .addSelect('t.type', 'type')
    .addSelect('t.created_at', 'timestamp')
    .addSelect('e.account', 'account')
    .addSelect('e.amount', 'amount')
    .getRawMany<LedgerEntryRow>()
}
