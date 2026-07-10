import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Transactional, runOnTransactionCommit } from 'typeorm-transactional'
import { SqsService } from '@ssut/nestjs-sqs'
import { CampaignRepository } from './repository'
import { Campaign, CampaignDraft } from './campaign'
import { CAMPAIGN_ACTIVATED_QUEUE } from './queues'
import { serializeCampaignActivated } from './campaign-events.codec'
import {
  BALANCE_RESERVATION,
  BalanceReservation,
} from '../wallet/balance-reservation'

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name)

  constructor(
    private readonly repository: CampaignRepository,
    private readonly sqs: SqsService,
    // Fala com o wallet só pela porta pública, nunca pelo service concreto.
    @Inject(BALANCE_RESERVATION)
    private readonly reservation: BalanceReservation,
  ) {}

  async create(command: CampaignDraft) {
    const campaign = Campaign.draft(command)
    const saved = await this.repository.create(campaign)
    return { id: saved.externalId, status: saved.status }
  }

  /**
   * Confirma a campanha: valida a transição no domínio, reserva o saldo no wallet
   * e persiste os novos status. Tudo numa transação — se a reserva estourar (saldo
   * insuficiente) ou a escrita falhar, nada é gravado. `reserve` também é
   * `@Transactional`, então propaga para a mesma transação (mesmo DataSource).
   */
  @Transactional()
  async confirm(id: string) {
    const now = new Date()
    const entity = await this.repository.findWithBatches(id)
    if (!entity) throw new NotFoundException('Campaign not found')

    const campaign = this.repository.toDomain(entity)
    campaign.activate(now)

    await this.reservation.reserve({
      accountId: campaign.accountId,
      amountCents: campaign.total(),
    })

    const saved = await this.repository.saveStatuses(entity, campaign)

    // Publica o gatilho de fan-out só DEPOIS do commit: se a transação der
    // rollback (saldo insuficiente, falha de escrita), nada é enfileirado — sem
    // fan-out de campanha não-ativada. SQS é at-least-once, então o consumidor é
    // idempotente por pageId. (Outbox seria o passo seguinte se o negócio exigir
    // garantia forte de entrega mesmo com o processo caindo entre commit e send.)
    runOnTransactionCommit(() => {
      void this.publishActivated(saved.externalId, campaign.accountId, now)
    })

    return { id: saved.externalId, status: saved.status }
  }

  private async publishActivated(campaignId: string, accountId: string, occurredAt: Date) {
    try {
      await this.sqs.send(CAMPAIGN_ACTIVATED_QUEUE, {
        id: campaignId,
        body: serializeCampaignActivated({ campaignId, accountId, occurredAt }),
      })
    } catch (error) {
      // Commit já passou: a campanha ESTÁ ativada. Não relançamos (a resposta
      // HTTP não deve falhar); logamos pro reprocesso/monitoração pegar.
      this.logger.error(
        `Failed to publish CampaignActivated ${campaignId}: ${(error as Error).message}`,
      )
    }
  }
}
