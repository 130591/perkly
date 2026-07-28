import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'

// Tabela separada de `UserActivations`/`TenantInvitations` de propósito —
// mesma forma, conhecimento de domínio diferente (RFC 0004, Decisão 7): o
// usuário já existe e está ativo; concluir sobrescreve a credencial e
// revoga todas as sessões (task 09), efeito que os outros dois não têm.
@Entity('password_resets')
export class PasswordResetEntity extends DefaultEntity<PasswordResetEntity> {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number

  @Column({ name: 'token_hash' })
  tokenHash: string

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null
}
