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
  async confirm(id: string, callerAccountId: string) {
    const entity = await this.repository.findWithBatches(id)
    if (!entity) throw new NotFoundException('Campaign not found')

    const campaign = this.repository.toDomain(entity)
    // 404, não 403: revelar que o recurso existe (só que é de outra conta)
    // vazaria informação sobre contas alheias (RFC 0005, Decisão 3).
    if (campaign.accountId !== callerAccountId)
      throw new NotFoundException('Campaign not found')

    campaign.activate(new Date())

    await this.reservation.reserve({
      accountId: campaign.accountId,
      amountCents: campaign.total(),
      idempotencyKey: `campaign-confirm:${id}`,
    })

    const saved = await this.repository.saveStatuses(entity, campaign)
    return { id: saved.externalId, status: saved.status }
  }

  /** Read-model for the campaigns list screen. */
  async list(accountId: string) {
    return this.repository.listStats(accountId)
  }

  /**
   * Read-model for the campaign detail screen. Reuses `listStats` (same
   * tenant-scoped query the list screen uses) rather than a second query
   * shape — 404, not a narrower WHERE, keeps "campaign exists but isn't
   * yours" indistinguishable from "doesn't exist" (RFC 0005, Decisão 3).
   */
  async findById(accountId: string, id: string) {
    const campaigns = await this.repository.listStats(accountId)
    const campaign = campaigns.find((c) => c.id === id)
    if (!campaign) throw new NotFoundException('Campaign not found')
    return campaign
  }

  /**
   * Read-model for the "Destinatários" table. Runs `findById` first purely
   * for its tenant-scoping + 404 — a caller can't page through another
   * tenant's recipients by guessing a campaign id.
   */
  async findRecipients(
    accountId: string,
    id: string,
    page: number,
    pageSize: number,
  ) {
    await this.findById(accountId, id)
    const { items, total } = await this.repository.listRecipients(
      id,
      pageSize,
      (page - 1) * pageSize,
    )
    return { items, total, page, pageSize }
  }
}
