import { Module } from '@nestjs/common'
import { CampaignController } from './campaign.controller'
import { CampaignService } from './service'
import { CampaignRepository } from './repository'

@Module({
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository],
})
export class CampaignModule {}
