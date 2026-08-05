import { readFileSync } from 'fs'
import { join } from 'path'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../../shared/database/core/typeorm'
import {
  Account,
  Snapshot,
  Transaction,
  TransactionProps,
} from '../../domain/ledger'
import { LedgerTransactionEntity } from '../entities/ledger-transaction.entity'
import { LedgerEntryEntity } from '../entities/ledger-entry.entity'

/** Loaded once at module init; see database/sql/account-balances.sql. */
const ACCOUNT_BALANCES_SQL = readFileSync(
  join(__dirname, '..', 'sql', 'account-balances.sql'),
  'utf8',
)

/** Loaded once at module init; see database/sql/ledger-entries.sql. */
const LEDGER_ENTRIES_SQL = readFileSync(
  join(__dirname, '..', 'sql', 'ledger-entries.sql'),
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

  /**
   * Persists a domain transaction (with its entries) and returns its DB id.
   * `reference` is opaque (see the entity) — pass the caller's idempotencyKey
   * for reserve/release/settle; omit for fund (linked via `charges` instead).
   */
  async append(
    walletId: number,
    transaction: Transaction,
    reference: string | null = null,
  ): Promise<number> {
    const saved = await this.save(
      new LedgerTransactionEntity({
        externalId: transaction.props.id,
        walletId,
        type: transaction.props.type,
        reference,
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

  /** Raw transaction rows for the extract screen — see ledger-entries.sql. */
  async listEntries(accountId: string): Promise<LedgerEntryRow[]> {
    const rows: RawLedgerEntryRow[] = await this.manager.query(
      LEDGER_ENTRIES_SQL,
      [accountId],
    )
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      createdAt: row.created_at,
      chargeMethod: row.charge_method,
      campaignName: row.campaign_name,
      availableDelta: row.available_delta,
      reservedDelta: row.reserved_delta,
    }))
  }
}

type AccountBalanceRow = {
  account: Account
  balance: string
}

export type LedgerEntryRow = {
  id: string
  type: TransactionProps['type']
  createdAt: Date
  chargeMethod: 'pix' | 'boleto' | null
  campaignName: string | null
  availableDelta: string
  reservedDelta: string
}

type RawLedgerEntryRow = {
  id: string
  type: TransactionProps['type']
  created_at: Date
  charge_method: 'pix' | 'boleto' | null
  campaign_name: string | null
  available_delta: string
  reserved_delta: string
}
