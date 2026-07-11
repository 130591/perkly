import { Injectable } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { PayoutRepository } from './database/repository'
import { PayoutBatchRequested } from '../campaign/messaging/campaign-events'
import { Payout } from './payout'
import { DomainEventPublisher, PayoutCreated } from './events'

@Injectable()
export class PayoutService {
  constructor(
    private readonly repository: PayoutRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  // Uma página de recipients → payouts, numa transação. Idempotente por `pageId`
  // (SQS é at-least-once): reprocessar a mesma página não pode duplicar payout.
  @Transactional()
  async createFromBatch(request: PayoutBatchRequested): Promise<void> {
    // Reivindica a página antes de qualquer escrita: se já foi processada numa
    // entrega anterior, no-op — nem payout nem evento duplicados. Claim + inserts
    // na mesma tx: ou tudo commita, ou nada (e a reentrega reprocessa do zero).
    const claimed = await this.repository.claimPage(request.pageId)
    if (!claimed) return

    for (const recipient of request.recipients) {
      const payout = Payout.draft({
        campaignId: request.campaignId,
        recipient,
        linksExpireAt: request.linksExpireAt,
      })

      const saved = await this.repository.create(payout)
      await this.events.publish(
        new PayoutCreated(saved.externalId, request.campaignId)
      )
    }
  }
}