import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../database/core/base.entity'
import { Channel } from './campaign'

/**
 * Recipients are stored inline as jsonb — they are value objects owned by the
 * campaign, not independently queried. `amountCents` is a decimal string (not a
 * JSON number) so the domain bigint survives the round-trip without float loss.
 */
type StoredRecipient = {
  name: string
  amountCents: string
  channel: Channel
}

@Entity('campaigns')
export class CampaignEntity extends DefaultEntity<CampaignEntity> {
  @Column()
  name: string

  @Column({ type: 'text' })
  message: string

  @Column({ name: 'transfer_type' })
  transferType: string

  @Column()
  status: string

  @Column({ name: 'links_expire_at', type: 'timestamptz' })
  linksExpireAt: Date

  @Column({ type: 'jsonb' })
  recipients: StoredRecipient[]
}
