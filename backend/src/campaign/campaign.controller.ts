import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { CampaignService } from './service'
import { CampaignBody } from './transport'
import { CurrentUser } from '../identity/current-user.decorator'
import { AuthenticatedUser } from '../identity/jwt.strategy'
import { Roles } from '../identity/roles.decorator'

@Controller('campaign')
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CampaignBody) {
    return this.service.create({
      ...body.toCommand(),
      accountId: user.accountId,
    })
  }

  @Post(':id/confirm')
  @Roles('ADMIN')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.confirm(id, user.accountId)
  }
}
