import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { CampaignService } from './service'
import { CampaignBody } from './http/transport'

@Controller('campaign')
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  @Post()
  create(@Body() body: CampaignBody) {
    return this.service.create(body.toCommand())
  }

  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.confirm(id)
  }
}
