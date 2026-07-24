import { Injectable, Logger } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { ClaimConfirmed, ClaimEvent, ClaimEventPublisher } from './events'
import { serializeClaimConfirmed, serializeClaimExpired } from './events.codec'
import { CLAIM_CONFIRMED_QUEUE, CLAIM_EXPIRED_QUEUE } from './queues'

/**
 * Publica `ClaimConfirmed`/`ClaimExpired` nas filas reais. Substitui o
 * placeholder de log — mesma evolução que `SqsDomainEventPublisher` já fez no
 * payout. Ninguém assina essas filas ainda (o Payout não tem consumer pra
 * elas), mas o Claim não fica bloqueado esperando o outro lado existir: o
 * service continua dependendo só da porta abstrata `ClaimEventPublisher`.
 */
@Injectable()
export class SqsClaimEventPublisher extends ClaimEventPublisher {
  private readonly logger = new Logger(SqsClaimEventPublisher.name)

  constructor(private readonly sqs: SqsService) {
    super()
  }

  async publish(event: ClaimEvent): Promise<void> {
    if (event instanceof ClaimConfirmed) {
      await this.sqs.send(CLAIM_CONFIRMED_QUEUE, {
        id: event.payoutId,
        body: serializeClaimConfirmed(event),
      })
    } else {
      await this.sqs.send(CLAIM_EXPIRED_QUEUE, {
        id: event.payoutId,
        body: serializeClaimExpired(event),
      })
    }
    this.logger.log(`${event.constructor.name} payout=${event.payoutId}`)
  }
}
