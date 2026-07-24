import { Injectable, Logger } from '@nestjs/common'
import { Message } from '@aws-sdk/client-sqs'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { PayoutService } from '../../service'
import { parseClaimExpired } from '../../../claim/messaging/events.codec'
import { CLAIM_EXPIRED_QUEUE } from '../../../claim/messaging/queues'

/**
 * Assina `ClaimExpired` e libera a reserva de saldo (o resgate nunca
 * aconteceu). Desserializa (codec do claim) e delega: idempotência vive no
 * service. Lançar aqui = SQS reentrega (at-least-once) → após
 * maxReceiveCount (5) cai na DLQ.
 */
@Injectable()
export class ClaimExpiredConsumer {
  private readonly logger = new Logger(ClaimExpiredConsumer.name)

  constructor(private readonly payout: PayoutService) {}

  @SqsMessageHandler(CLAIM_EXPIRED_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const event = parseClaimExpired(message.Body ?? '')
    await this.payout.expire(event)
    this.logger.log(`Expired payout ${event.payoutId}`)
  }
}
