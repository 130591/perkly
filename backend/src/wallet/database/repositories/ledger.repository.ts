import { readFileSync } from 'fs'
import { join } from 'path'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../../database/core/typeorm'
import { Account, Snapshot, Transaction } from '../../domain/ledger'
import { LedgerTransactionEntity } from '../entities/ledger-transaction.entity'
import { LedgerEntryEntity } from '../entities/ledger-entry.entity'

/** Loaded once at module init; see database/sql/account-balances.sql. */
const ACCOUNT_BALANCES_SQL = readFileSync(
  join(__dirname, '..', 'sql', 'account-balances.sql'),
  'utf8',
)

@Injectable()
export class LedgerRepository extends DefaultTypeOrmRepository<LedgerTransactionEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(LedgerTransactionEntity, dataSource.manager)
  }

  /**
   * Per-account ledger balances for `accountId`, aggregated in SQL (one row
   * per account, not the full journal). Feed straight into `Ledger.hydrate`.
   */
  async loadBalances(accountId: string): Promise<Snapshot> {
    const rows: AccountBalanceRow[] = await this.manager.query(
      ACCOUNT_BALANCES_SQL,
      [accountId],
    )

    const snapshot: Snapshot = {}
    for (const row of rows) {
      snapshot[row.account] = BigInt(row.balance)
    }
    return snapshot
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
}

type AccountBalanceRow = {
  account: Account
  balance: string
}
