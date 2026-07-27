import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'

export type UserRole = 'ADMIN' | 'MEMBER'

// RFC 0004, Decisão 11 — enum fechado, não timestamp nullable, porque
// `disabled` (e possivelmente outros estados) já está previsto.
export type UserStatus = 'pending_activation' | 'active' | 'disabled'

// `accountId` é coluna simples, não relação — mesmo padrão de
// `ChargeEntity.walletId` (FK interna, mesmo módulo).
// `name` nullable: o primeiro admin nasce sem nome de pessoa (Decisão 14).
// `passwordHash` nullable: `pending_activation` ainda não tem senha.
@Entity('users')
export class UserEntity extends DefaultEntity<UserEntity> {
  @Column({ name: 'account_id', type: 'bigint' })
  accountId: number

  @Column({ unique: true })
  email: string

  @Column({ type: 'varchar', nullable: true })
  name: string | null

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null

  @Column({ type: 'varchar' })
  role: UserRole

  @Column({ type: 'varchar', default: 'pending_activation' })
  status: UserStatus
}
