import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../database/core/typeorm'
import { CampaignEntity, BatchEntity } from './campaign.entity'
import { Campaign, CampaignStatus, TransferType } from '../domain/campaign'
import { Batch } from '../domain/batch'

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
  saveStatuses(entity: CampaignEntity, campaign: Campaign): Promise<CampaignEntity> {
    entity.status = campaign.status
    return this.save(entity)
  }
}
