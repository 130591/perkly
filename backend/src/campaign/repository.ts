import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../database/core/typeorm'
import { CampaignEntity, BatchEntity } from './campaign.entity'
import { Campaign, CampaignStatus, TransferType } from './campaign'
import { Batch } from './batch'

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
