import { Column, Entity, JoinColumn, OneToOne } from 'typeorm'
import { DefaultEntity } from '../../../database/core/base.entity'
import { AccountEntity } from './account.entity'

/**
 * `wallet` table. The FK to `accounts` is exposed through the `account`
 * relation (column `account_id`) so we can filter a wallet by the account's
 * external id, as the original knex join did.
 */
@Entity('wallet')
export class WalletEntity extends DefaultEntity<WalletEntity> {
  @Column({ type: 'bigint', default: 0 })
  balance: string

  @OneToOne(() => AccountEntity)
  @JoinColumn({ name: 'account_id' })
  account: AccountEntity
}
