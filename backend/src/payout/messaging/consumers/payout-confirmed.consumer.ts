import { Injectable, Logger } from '@nestjs/common'
import { Message } from '@aws-sdk/client-sqs'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { PayoutService } from '../../service'
import { parsePayoutConfirmed } from '../../../settle/rail-events.codec'
import { PAYOUT_CONFIRMED_QUEUE } from '../../../settle/queues'

/**
 * Assina `PayoutConfirmed` (settle, a partir do webhook `pix-payment-out`) e
 * conclui a liquidação: consome a reserva no wallet e marca o payout pago.
 * Desserializa (codec do settle) e delega: idempotência vive no service.
 * Lançar aqui = SQS reentrega (at-least-once) → após maxReceiveCount (5) cai
 * na DLQ.
 */
@Injectable()
export class PayoutConfirmedConsumer {
  private readonly logger = new Logger(PayoutConfirmedConsumer.name)

  constructor(private readonly payout: PayoutService) {}

  @SqsMessageHandler(PAYOUT_CONFIRMED_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const event = parsePayoutConfirmed(message.Body ?? '')
    await this.payout.confirmPayment(event)
    this.logger.log(`Paid payout ${event.reference}`)
  }
}
