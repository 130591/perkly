import { Entity } from 'typeorm'
import { DefaultEntity } from '../core/base.entity'

/**
 * `accounts` table. The only columns the wallet flow needs are the ones
 * already provided by DefaultEntity (id + externalId), so there is nothing
 * extra to declare here.
 */
@Entity('accounts')
export class AccountEntity extends DefaultEntity<AccountEntity> {}
