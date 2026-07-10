import { Injectable, Logger } from '@nestjs/common'
import { Message } from '@aws-sdk/client-sqs'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { PayoutService } from './service'
import { parsePayoutBatchRequested } from '../campaign/campaign-events.codec'
import { PAYOUT_BATCH_QUEUE } from '../campaign/queues'

/**
 * Assina `PayoutBatchRequested` — uma página de recipients publicada pelo fan-out
 * do campaign — e cria os payouts. Desserializa (codec) e delega: idempotência
 * (claim por `pageId`) e regra vivem no service. Lançar aqui = SQS reentrega
 * (at-least-once) → após maxReceiveCount (5) cai na DLQ.
 */
@Injectable()
export class CreatePayoutConsumer {
  private readonly logger = new Logger(CreatePayoutConsumer.name)

  constructor(private readonly payout: PayoutService) {}

  @SqsMessageHandler(PAYOUT_BATCH_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const request = parsePayoutBatchRequested(message.Body ?? '')
    await this.payout.createFromBatch(request)
    this.logger.log(
      `Created payouts for page ${request.pageId} (${request.recipients.length} recipient(s))`,
    )
  }
}
