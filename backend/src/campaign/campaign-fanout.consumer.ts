import { Injectable, Logger } from '@nestjs/common'
import { SqsMessageHandler, SqsService } from '@ssut/nestjs-sqs'
import { Message } from '@aws-sdk/client-sqs'
import { CampaignRepository } from './repository'
import {
  parseCampaignActivated,
  serializePayoutBatchRequested,
} from './campaign-events.codec'
import { PayoutBatchRequested, PayoutRecipient } from './campaign-events'
import { CAMPAIGN_ACTIVATED_QUEUE, PAYOUT_BATCH_QUEUE } from './queues'

/** Recipients por mensagem — mantém o corpo bem abaixo dos 256 KB do SQS. */
const PAGE_SIZE = 500

/**
 * Fan-out: assina `CampaignActivated` (magro) e explode a campanha em páginas de
 * recipients, uma `PayoutBatchRequested` por página. Vive no campaign porque é o
 * campaign que detém os recipients; o payout nunca lê o banco daqui, só consome
 * as mensagens limitadas.
 *
 * Recipients são jsonb inline no batch (não são linhas), então a paginação é em
 * memória: carrega a campanha e fatia o array de cada batch. `pageId` estável
 * (`${batchId}:${índice}`) é a âncora de idempotência do lado do payout — SQS é
 * at-least-once, reprocessar a mesma página não pode duplicar payout.
 */
@Injectable()
export class CampaignFanoutConsumer {
  private readonly logger = new Logger(CampaignFanoutConsumer.name)

  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly sqs: SqsService,
  ) {}

  @SqsMessageHandler(CAMPAIGN_ACTIVATED_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const event = parseCampaignActivated(message.Body ?? '')
    const campaign = await this.campaigns.findWithBatches(event.campaignId)
    if (!campaign) {
      // Ativada mas sumiu: nada a paginar. Loga e não reentrega — lançar só
      // devolveria à fila até a DLQ, sem chance de melhorar.
      this.logger.warn(`Campaign ${event.campaignId} not found for fan-out`)
      return
    }

    let pages = 0
    for (const batch of campaign.batches) {
      for (let start = 0; start < batch.recipients.length; start += PAGE_SIZE) {
        const slice = batch.recipients.slice(start, start + PAGE_SIZE)
        const request: PayoutBatchRequested = {
          pageId: `${batch.externalId}:${start / PAGE_SIZE}`,
          campaignId: event.campaignId,
          linksExpireAt: batch.linksExpireAt,
          recipients: slice.map(
            (recipient): PayoutRecipient => ({
              name: recipient.name,
              amountCents: BigInt(recipient.amountCents),
              channel: recipient.channel,
            }),
          ),
        }
        await this.sqs.send(PAYOUT_BATCH_QUEUE, {
          id: request.pageId,
          body: serializePayoutBatchRequested(request),
        })
        pages++
      }
    }

    this.logger.log(`Fanned out campaign ${event.campaignId} into ${pages} page(s)`)
  }
}
