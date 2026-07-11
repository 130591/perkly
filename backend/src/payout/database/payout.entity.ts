import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm'
import { DefaultEntity } from '../../database/core/base.entity'
import { Channel } from '../../campaign/domain/batch'

@Entity('payout')
export class PayoutEntity extends DefaultEntity<PayoutEntity> {
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string

  @Column()
  recipientName: string

  @Column({ name: 'amount_cents', type: 'numeric' })
  amountCents: string

  @Column({ type: 'jsonb' })
  channel: Channel

  @Column()
  status: string

  @Column({ name: 'pix_key', nullable: true })
  pixKey?: string

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt?: Date

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date
}