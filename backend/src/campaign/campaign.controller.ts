import { Body, Controller, Post } from '@nestjs/common'
import { CampaignService } from './service'
import { CampaignBody } from './transport'

@Controller('campaign')
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  @Post()
  create(@Body() body: CampaignBody) {
    return this.service.create(body.toCommand())
  }
}