import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { NewTenantBody } from './transport'
import { Service } from './service'
import { BackofficeGuard } from './backoffice.guard'

@Controller('identity')
export class Authentication {
  constructor(private readonly service: Service) {}

  @Post('backoffice/tenants')
  @UseGuards(BackofficeGuard)
  async newTenant(@Body() body: NewTenantBody) {
    return this.service.createTenant(body)
  }

  @Post('activate')
  async activeUserAdmin(@Body() body: any) {
    await this.service.activeAdmin(body)
  }
}
