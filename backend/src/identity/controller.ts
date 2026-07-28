import {
  Body,
  Controller,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { NewTenantBody, LoginBody } from './transport'
import { Service } from './service'
import { BackofficeGuard } from './backoffice.guard'
import { ConfigService } from '../shared/config/service'

// RFC 0004, Decisão 6.
const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

@Controller('identity')
export class Authentication {
  constructor(
    private readonly service: Service,
    private readonly config: ConfigService,
  ) {}

  @Post('backoffice/tenants')
  @UseGuards(BackofficeGuard)
  async newTenant(@Body() body: NewTenantBody) {
    return this.service.createTenant(body)
  }

  @Patch('activate')
  async activeUserAdmin(@Body() body: any) {
    await this.service.activeAdmin(body)
  }

  @Post('login')
  async login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.service.login(body)

    // `secure` exige HTTPS — localhost em dev roda HTTP puro, então fica
    // condicionado ao ambiente (senão o browser descarta o cookie em dev).
    const isProd = this.config.get('env') === 'production'

    // Refresh token só viaja por cookie HttpOnly — nunca acessível a JS
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    })

    return { accessToken }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined
    if (refreshToken) await this.service.logout(refreshToken)

    res.clearCookie('refreshToken')
  }
}
