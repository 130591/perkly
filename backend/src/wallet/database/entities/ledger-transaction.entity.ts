import { Column, Entity, OneToMany } from 'typeorm'
import { DefaultEntity } from '../core/base.entity'
import { TransactionProps } from '../../domain/ledger'
import { LedgerEntryEntity } from './ledger-entry.entity'

/**
 * `ledger_transactions` table. `created_at` is provided by DefaultEntity and is
 * used as the journal ordering key (matching the original ORDER BY t.created_at).
 */
@Entity('ledger_transactions')
export class LedgerTransactionEntity extends DefaultEntity<LedgerTransactionEntity> {
  @Column({ name: 'wallet_id', type: 'bigint' })
  walletId: number

  @Column({ type: 'varchar' })
  type: TransactionProps['type']

  @OneToMany(() => LedgerEntryEntity, (entry) => entry.transaction, {
    cascade: true,
  })
  entries: LedgerEntryEntity[]
}
