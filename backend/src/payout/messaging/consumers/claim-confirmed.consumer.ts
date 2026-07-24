import { Injectable, Logger } from '@nestjs/common'
import { Message } from '@aws-sdk/client-sqs'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { PayoutService } from '../../service'
import { parseClaimConfirmed } from '../../../claim/messaging/events.codec'
import { CLAIM_CONFIRMED_QUEUE } from '../../../claim/messaging/queues'

/**
 * Assina `ClaimConfirmed` e inicia o processamento do payout (chama o PSP).
 * Desserializa (codec do claim — a forma na fila é conhecimento dele) e
 * delega: idempotência (status já não é mais 'pending') vive no service.
 * Lançar aqui = SQS reentrega (at-least-once) → após maxReceiveCount (5) cai
 * na DLQ.
 */
@Injectable()
export class ClaimConfirmedConsumer {
  private readonly logger = new Logger(ClaimConfirmedConsumer.name)

  constructor(private readonly payout: PayoutService) {}

  @SqsMessageHandler(CLAIM_CONFIRMED_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const event = parseClaimConfirmed(message.Body ?? '')
    await this.payout.startProcessing(event)
    this.logger.log(`Processing payout ${event.payoutId}`)
  }
}
