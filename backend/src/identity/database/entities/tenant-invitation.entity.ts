import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'
import { UserRole } from './user.entity'

// Tabela separada de `UserActivations`/`PasswordResets` de propósito — mesma
// forma, conhecimento de domínio diferente (RFC 0004, Decisão 7). O usuário
// não existe ainda: nasce só no aceite (task 07).
@Entity('tenant_invitations')
export class TenantInvitationEntity extends DefaultEntity<TenantInvitationEntity> {
  @Column({ name: 'account_id', type: 'bigint' })
  accountId: number

  @Column()
  email: string

  @Column({ type: 'varchar' })
  role: UserRole

  @Column({ name: 'token_hash' })
  tokenHash: string

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null
}
