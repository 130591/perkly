import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import { CampaignService } from './service'
import { CampaignBody } from './transport'
import { CurrentUser, AuthenticatedUser, Roles } from '../identity/auth'

@Controller('campaign')
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser, 
    @Body() body: CampaignBody,
    @Query('idempotencyKey') idempotencyKey: string,
  ) {
    return this.service.create({
      ...body.toCommand(),
      accountId: user.accountId,
    })
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.accountId)
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findById(user.accountId, id)
  }

  @Get(':id/recipients')
  findRecipients(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ) {
    return this.service.findRecipients(user.accountId, id, page, pageSize)
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
