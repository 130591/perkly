import { Injectable, Logger } from '@nestjs/common'
import { Message } from '@aws-sdk/client-sqs'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { ClaimService } from '../service'
import { parsePayoutCreated } from '../../payout/messaging/events.codec'
import { PAYOUT_CREATED_QUEUE } from '../../payout/messaging/queues'

/**
 * Assina `PayoutCreated` e gera o link de resgate. Desserializa (codec do
 * payout — a forma na fila é conhecimento dele) e delega: idempotência mora
 * no repository (índice único em `payout_id`). Lançar aqui = SQS reentrega
 * (at-least-once) → após maxReceiveCount (5) cai na DLQ.
 */
@Injectable()
export class CreateClaimConsumer {
  private readonly logger = new Logger(CreateClaimConsumer.name)

  constructor(private readonly claim: ClaimService) {}

  @SqsMessageHandler(PAYOUT_CREATED_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const event = parsePayoutCreated(message.Body ?? '')
    await this.claim.createFromPayout(event)
    this.logger.log(`Created claim for payout ${event.payoutId}`)
  }
}
