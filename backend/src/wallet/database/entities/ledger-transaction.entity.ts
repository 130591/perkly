import { Column, Entity, OneToMany } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'
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

  // Opaque caller reference, reused verbatim from `ReserveBalance.idempotencyKey`
  // et al. (`campaign-confirm:<uuid>`, `payout-expire:<uuid>`, `payout-settle:<uuid>`).
  // Null for `fund` (no such caller — `charges.transaction_id` already links that
  // back). Wallet never interprets this string; it exists so a read-model outside
  // this module (see ledger-entries.sql) can resolve "what caused this movement"
  // without wallet knowing about campaign/payout (RFC 0004, Decisão 2 — loose
  // reference, not FK).
  @Column({ type: 'varchar', nullable: true })
  reference: string | null

  @OneToMany(() => LedgerEntryEntity, (entry) => entry.transaction, {
    cascade: true,
  })
  entries: LedgerEntryEntity[]
}
