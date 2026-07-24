import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../database/core/base.entity'
import { Channel } from '../../campaign/domain/batch'

/**
 * `externalId` (herdado de `DefaultEntity`) É o token do link de resgate —
 * `GET/POST /claims/:externalId`. `payoutId` é único: um Claim por payout,
 * pra sempre (garante "impedir reutilização" também na criação — reentrega do
 * evento `PayoutCreated` colide no índice e vira no-op, sem precisar de uma
 * tabela de inbox separada como o payout usa pra página).
 */
@Entity('claim')
export class ClaimEntity extends DefaultEntity<ClaimEntity> {
  @Column({ name: 'payout_id', type: 'uuid', unique: true })
  payoutId: string

  @Column({ name: 'contact_name' })
  contactName: string

  @Column({ type: 'jsonb' })
  channel: Channel

  @Column({ name: 'amount_cents', type: 'numeric' })
  amountCents: string

  @Column()
  status: string

  @Column({ name: 'pix_key', type: 'text', nullable: true })
  pixKey?: string

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date
}
