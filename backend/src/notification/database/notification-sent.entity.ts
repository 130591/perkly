import { Column, Entity, Unique } from 'typeorm'
import { DefaultEntity } from '../../shared/database/core/base.entity'

@Entity('notification_sent')
@Unique(['reason', 'idempotencyKey'])
export class NotificationSentEntity extends DefaultEntity<NotificationSentEntity> {
  @Column({ type: 'text' })
  reason: string

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey: string

  @Column({ type: 'text' })
  channel: string
}
