import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { Transactional } from 'typeorm-transactional'
import { CampaignRepository } from './repository'
import { serializePayoutBatchRequested } from './campaign-events.codec'
import { PayoutBatchRequested, PayoutRecipient } from './campaign-events'
import { PAYOUT_BATCH_QUEUE } from './queues'
import { ConfigService } from '../config/service'

/** Recipients por mensagem — mantém o corpo bem abaixo dos 256 KB do SQS. */
const PAGE_SIZE = 500

/** Intervalo da varredura. Fan-out dispara no próximo tick, não na hora. */
const SCAN_INTERVAL_MS = 15_000

/**
 * Fan-out por VARREDURA de estado durável (RFC 0002), não por evento. Em vez de
 * reagir a um `campaign-activated` que podia se perder na janela commit↔send —
 * deixando a campanha zumbi: ativada, saldo reservado, sem payouts e sem
 * recuperação —, varre `status='active' AND fanned_out_at IS NULL`. A linha da
 * campanha É a fila de trabalho: uma campanha que commitou ativa é garantidamente
 * pega na próxima varredura.
 *
 * Corretude sob crash: reivindica com lock, publica TODAS as páginas e só então
 * marca `fanned_out_at` — tudo no mesmo commit. Crash no meio → rollback → marca
 * fica NULL → próxima varredura reenvia; páginas já enviadas viram no-op
 * (idempotência por `pageId` no payout). Nunca existe "marcado sem páginas".
 */
@Injectable()
export class CampaignFanoutWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CampaignFanoutWorker.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly sqs: SqsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Em `test` não ligamos o loop: o harness boota o AppModule inteiro e um
    // scanner de fundo puxaria trabalho (open handles, ruído em CI). O fluxo é
    // exercido por teste dedicado chamando `drain()` à mão — igual aos pollers
    // de SQS, desligados no mesmo ambiente.
    if (this.config.get('env') === 'test') return
    this.timer = setInterval(() => void this.tick(), SCAN_INTERVAL_MS)
    this.timer.unref() // não segura o processo vivo sozinho
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  // Guard contra sobreposição: se a varredura anterior ainda roda quando o timer
  // dispara, pula. Uma instância, uma varredura por vez.
  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.drain()
    } catch (error) {
      this.logger.error(`Fan-out scan failed: ${(error as Error).message}`)
    } finally {
      this.running = false
    }
  }

  /** Despacha campanhas pendentes, uma por transação, até esvaziar. */
  async drain(): Promise<void> {
    while (await this.dispatchNext()) {
      // segue até `dispatchNext` não achar mais trabalho
    }
  }

  /**
   * Uma campanha pendente → páginas, numa transação. Reivindica com lock
   * (`SKIP LOCKED`), publica cada página e marca `fanned_out_at` no mesmo commit.
   * O `send` acontece DENTRO da tx, antes da marca commitar — é isso que dá a
   * crash-safety (publicar após o commit reintroduziria a perda). Retorna
   * `false` quando não há mais trabalho.
   */
  @Transactional()
  async dispatchNext(): Promise<boolean> {
    const campaign = await this.campaigns.claimPendingFanout()
    if (!campaign) return false

    let pages = 0
    for (const batch of campaign.batches) {
      for (let start = 0; start < batch.recipients.length; start += PAGE_SIZE) {
        const slice = batch.recipients.slice(start, start + PAGE_SIZE)
        const request: PayoutBatchRequested = {
          pageId: `${batch.externalId}:${start / PAGE_SIZE}`,
          campaignId: campaign.externalId,
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

    await this.campaigns.markFannedOut(campaign, new Date())
    this.logger.log(
      `Fanned out campaign ${campaign.externalId} into ${pages} page(s)`,
    )
    return true
  }
}
