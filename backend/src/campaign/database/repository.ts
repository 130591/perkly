import { readFileSync } from 'fs'
import { join } from 'path'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { CampaignEntity, BatchEntity } from './campaign.entity'
import { Campaign, CampaignStatus, TransferType } from '../domain/campaign'
import { Batch, Channel } from '../domain/batch'

/** Loaded once at module init; see database/sql/campaign-stats.sql. */
const CAMPAIGN_STATS_SQL = readFileSync(
  join(__dirname, 'sql', 'campaign-stats.sql'),
  'utf8',
)

/** Loaded once at module init; see database/sql/campaign-recipients.sql. */
const CAMPAIGN_RECIPIENTS_SQL = readFileSync(
  join(__dirname, 'sql', 'campaign-recipients.sql'),
  'utf8',
)

@Injectable()
export class CampaignRepository extends DefaultTypeOrmRepository<CampaignEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(CampaignEntity, dataSource.manager)
  }

  async create(campaign: Campaign): Promise<CampaignEntity> {
    return await this.save(
      new CampaignEntity({
        accountId: campaign.accountId,
        name: campaign.name,
        message: campaign.message,
        transferType: campaign.transferType,
        status: campaign.status,
        batches: campaign.batches.map(
          (batch) =>
            new BatchEntity({
              linksExpireAt: batch.linksExpireAt,
              recipients: batch.recipients.map((recipient) => ({
                name: recipient.name,
                amountCents: recipient.amountCents.toString(),
                channel: recipient.channel,
              })),
            }),
        ),
      }),
    )
  }

  findWithBatches(externalId: string): Promise<CampaignEntity | null> {
    return this.findOneById(externalId, ['batches'])
  }

  /**
   * Reivindica UMA campanha ativa ainda sem fan-out, travando a linha
   * (`FOR UPDATE SKIP LOCKED`): scanners concorrentes pulam em vez de
   * reprocessar. `null` = sem trabalho. Deve rodar na tx do worker — o lock vive
   * até o commit (grava `fanned_out_at`) ou rollback (crash → devolve à fila).
   *
   * O lock é num SELECT só da tabela `campaigns` (sem join); os batches vêm num
   * 2º SELECT (`findWithBatches`), porque `FOR UPDATE` não pode ser aplicado ao
   * lado nulável do LEFT JOIN da relação. `deleted_at IS NULL` é explícito: o
   * query builder cru não aplica o filtro de soft-delete que o `find` aplicaria.
   */
  async claimPendingFanout(): Promise<CampaignEntity | null> {
    const locked = await this.manager
      .createQueryBuilder(CampaignEntity, 'campaign')
      .where('campaign.status = :status', { status: 'active' })
      .andWhere('campaign.fannedOutAt IS NULL')
      .andWhere('campaign.deletedAt IS NULL')
      .orderBy('campaign.id', 'ASC')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .limit(1)
      .getOne()

    if (!locked) return null
    return this.findWithBatches(locked.externalId)
  }

  /** Marca o fan-out concluído. Chamado POR ÚLTIMO, no mesmo commit dos envios. */
  markFannedOut(entity: CampaignEntity, at: Date): Promise<CampaignEntity> {
    entity.fannedOutAt = at
    return this.save(entity)
  }

  toDomain(entity: CampaignEntity): Campaign {
    return Campaign.hydrate({
      accountId: entity.accountId,
      name: entity.name,
      message: entity.message,
      transferType: entity.transferType as TransferType,
      status: entity.status as CampaignStatus,
      batches: entity.batches.map((batch) =>
        Batch.hydrate({
          linksExpireAt: batch.linksExpireAt,
          recipients: batch.recipients.map((recipient) => ({
            name: recipient.name,
            amountCents: BigInt(recipient.amountCents),
            channel: recipient.channel,
          })),
        }),
      ),
    })
  }

  /**
   * Persiste o resultado de uma transição de ciclo de vida. O status vive só na
   * campanha (o batch é agrupamento de recipients, sem lifecycle próprio). O
   * cascade do @OneToMany grava campanha + batches na mesma transação.
   */
  saveStatuses(
    entity: CampaignEntity,
    campaign: Campaign,
  ): Promise<CampaignEntity> {
    entity.status = campaign.status
    return this.save(entity)
  }

  /** Read-model for the campaigns list/detail screens — see campaign-stats.sql. */
  async listStats(accountId: string): Promise<CampaignStatsRow[]> {
    const rows: RawCampaignStatsRow[] = await this.manager.query(
      CAMPAIGN_STATS_SQL,
      [accountId],
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status as CampaignStatus,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      sent: Number(row.sent),
      redeemed: Number(row.redeemed),
      pending: Number(row.pending),
      expired: Number(row.expired),
      totalCents: row.total_cents,
      pendingCents: row.pending_cents,
      paidCents: row.paid_cents,
    }))
  }

  /** Read-model for the "Destinatários" table — see campaign-recipients.sql. */
  async listRecipients(
    campaignExternalId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: RecipientRow[]; total: number }> {
    const rows: RawRecipientRow[] = await this.manager.query(
      CAMPAIGN_RECIPIENTS_SQL,
      [campaignExternalId, limit, offset],
    )
    return {
      total: rows[0] ? Number(rows[0].total_count) : 0,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        channel: row.channel,
        amountCents: row.amount_cents,
        status: row.status,
        paidAt: row.paid_at,
        createdAt: row.created_at,
      })),
    }
  }
}

export type CampaignStatsRow = {
  id: string
  name: string
  status: CampaignStatus
  createdAt: Date
  expiresAt: Date | null
  sent: number
  redeemed: number
  pending: number
  expired: number
  totalCents: string
  pendingCents: string
  paidCents: string
}

type RawCampaignStatsRow = {
  id: string
  name: string
  status: string
  created_at: Date
  expires_at: Date | null
  sent: string
  redeemed: string
  pending: string
  expired: string
  total_cents: string
  pending_cents: string
  paid_cents: string
}

export type RecipientRow = {
  id: string
  name: string
  channel: Channel
  amountCents: string
  status: string
  paidAt: Date | null
  createdAt: Date
}

type RawRecipientRow = {
  id: string
  name: string
  channel: Channel
  amount_cents: string
  status: string
  paid_at: Date | null
  created_at: Date
  total_count: string
}
