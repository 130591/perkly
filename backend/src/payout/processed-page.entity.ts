import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../database/core/base.entity'

/**
 * Inbox de idempotência do fan-out: uma linha por página de recipients já
 * processada. `pageId` único é o guard — reprocessar a mesma
 * `PayoutBatchRequested` (SQS é at-least-once) colide no índice único e vira
 * no-op, sem duplicar payout nem evento `PayoutCreated`.
 */
@Entity('payout_page')
export class ProcessedPageEntity extends DefaultEntity<ProcessedPageEntity> {
  @Column({ name: 'page_id', type: 'text', unique: true })
  pageId: string
}
