import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { DefaultEntity } from '../../../database/core/base.entity'
import { Account } from '../../domain/ledger'
import { LedgerTransactionEntity } from './ledger-transaction.entity'

/**
 * `ledger_entries` table. The FK to `ledger_transactions` is owned by the
 * `transaction` relation (column `transaction_id`); entries are persisted via
 * the parent transaction's cascade.
 */
@Entity('ledger_entries')
export class LedgerEntryEntity extends DefaultEntity<LedgerEntryEntity> {
  @Column({ type: 'varchar' })
  account: Account

  @Column({ type: 'bigint' })
  amount: string

  @ManyToOne(() => LedgerTransactionEntity, (transaction) => transaction.entries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction: LedgerTransactionEntity
}
