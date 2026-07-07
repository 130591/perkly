import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { CampaignRepository } from './repository'
import { Campaign, CampaignDraft } from './campaign'
import {
  BALANCE_RESERVATION,
  BalanceReservation,
} from '../wallet/balance-reservation'

@Injectable()
export class CampaignService {
  constructor(
    private readonly repository: CampaignRepository,
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
    const entity = await this.repository.findWithBatches(id)
    if (!entity) throw new NotFoundException('Campaign not found')

    const campaign = this.repository.toDomain(entity)
    campaign.activate(new Date())

    await this.reservation.reserve({
      accountId: campaign.accountId,
      amountCents: campaign.total(),
    })

    const saved = await this.repository.saveStatuses(entity, campaign)
    return { id: saved.externalId, status: saved.status }
  }
}
