import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'

/**
 * `wallet` table. `account_id` is the account's external UUID, stored as an
 * opaque column — `accounts` is owned by `identity` now, so wallet does not
 * import or relate to that entity (see RFC 0004, Decisão 2).
 */
@Entity('wallet')
export class WalletEntity extends DefaultEntity<WalletEntity> {
  @Column({ type: 'bigint', default: 0 })
  balance: string

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string
}
