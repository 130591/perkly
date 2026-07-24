import { Injectable, Logger } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { DomainEventPublisher, PayoutCreated } from './events'
import { serializePayoutCreated } from './events.codec'
import { PAYOUT_CREATED_QUEUE } from './queues'

/**
 * Publica `PayoutCreated` na fila real. Substitui o placeholder de log agora
 * que o Claim existe e assina `payout-created` — o service continua
 * dependendo só da porta abstrata `DomainEventPublisher`, então essa troca não
 * tocou em nada fora deste arquivo e do módulo.
 */
@Injectable()
export class SqsDomainEventPublisher extends DomainEventPublisher {
  private readonly logger = new Logger(SqsDomainEventPublisher.name)

  constructor(private readonly sqs: SqsService) {
    super()
  }

  async publish(event: PayoutCreated): Promise<void> {
    await this.sqs.send(PAYOUT_CREATED_QUEUE, {
      id: event.payoutId,
      body: serializePayoutCreated(event),
    })
    this.logger.log(
      `PayoutCreated payout=${event.payoutId} campaign=${event.campaignId}`,
    )
  }
}
