import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'

// Tabela separada de `TenantInvitations`/`PasswordResets` de propósito — mesma
// forma, conhecimento de domínio diferente (RFC 0004, Decisão 7).
@Entity('user_activations')
export class UserActivationEntity extends DefaultEntity<UserActivationEntity> {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number

  @Column({ name: 'token_hash' })
  tokenHash: string

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null
}
