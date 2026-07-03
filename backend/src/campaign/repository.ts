import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../database/core/typeorm'
import { CampaignEntity } from './campaign.entity'
import { Campaign } from './campaign'

@Injectable()
export class CampaignRepository extends DefaultTypeOrmRepository<CampaignEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(CampaignEntity, dataSource.manager)
  }

  async create(campaign: Campaign): Promise<CampaignEntity> {
    return await this.save(
      new CampaignEntity({
        name: campaign.name,
        message: campaign.message,
        transferType: campaign.transferType,
        status: campaign.status,
        linksExpireAt: campaign.linksExpireAt,
        recipients: campaign.recipients.map((recipient) => ({
          name: recipient.name,
          amountCents: recipient.amountCents.toString(),
          channel: recipient.channel,
        })),
      }),
    )
  }
}
