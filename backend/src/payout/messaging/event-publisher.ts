import { Injectable, Logger } from '@nestjs/common'
import { DomainEventPublisher, PayoutCreated } from './events'

/**
 * Publisher provisório: só loga. Placeholder até o contexto Claim existir e
 * assinar `PayoutCreated` — aí troca por um transporte real (SQS) sem tocar no
 * service, que depende só da porta abstrata `DomainEventPublisher`.
 */
@Injectable()
export class LoggingDomainEventPublisher extends DomainEventPublisher {
  private readonly logger = new Logger(LoggingDomainEventPublisher.name)

  async publish(event: PayoutCreated): Promise<void> {
    this.logger.log(
      `PayoutCreated payout=${event.payoutId} campaign=${event.campaignId}`,
    )
  }
}
