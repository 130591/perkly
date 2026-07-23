import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { CampaignRepository } from './database/repository'
import { Campaign, CampaignDraft } from './domain/campaign'
import {
  BALANCE_RESERVATION,
  BalanceReservation,
} from '../wallet/balance-reservation'

@Injectable()
export class CampaignService {
  constructor(
    private readonly repository: CampaignRepository,
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
   * e persiste `active`. Tudo numa transação — se a reserva estourar (saldo
   * insuficiente) ou a escrita falhar, nada é gravado. `reserve` também é
   * `@Transactional`, então propaga para a mesma transação (mesmo DataSource).
   *
   * O fan-out NÃO é disparado aqui. A linha `active` já é o gatilho durável: o
   * `CampaignFanoutWorker` varre `status='active' AND fanned_out_at IS NULL`.
   * Assim não há evento a se perder entre o commit e um `send` (RFC 0002).
   */
  @Transactional()
  async confirm(id: string) {
    const entity = await this.repository.findWithBatches(id)
    if (!entity) throw new NotFoundException('Campaign not found')

    const campaign = this.repository.toDomain(entity)
    campaign.activate(new Date())

    await this.reservation.reserve({
      accountId: campaign.accountId,
      amountCents: campaign.total(),
      idempotencyKey: `campaign-confirm:${id}`,
    })

    const saved = await this.repository.saveStatuses(entity, campaign)
    return { id: saved.externalId, status: saved.status }
  }
}
