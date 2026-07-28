import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'

// Refresh token é stateful de propósito (RFC 0004, Decisão 5) — logout
// revoga de verdade. `usedAt` sustenta a rotação com grace period (Decisão 6).
@Entity('refresh_tokens')
export class RefreshTokenEntity extends DefaultEntity<RefreshTokenEntity> {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number

  @Column({ name: 'token_hash' })
  tokenHash: string

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null
}
