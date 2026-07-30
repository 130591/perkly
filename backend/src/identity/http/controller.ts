import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { Request, Response } from 'express'
import {
  NewTenantBody,
  LoginBody,
  InviteMemberBody,
  AcceptInvitationBody,
  RequestPasswordResetBody,
  ConfirmPasswordResetBody,
} from './transport'
import {
  MembershipService,
  PasswordRecoveryService,
  SessionService,
  TenantProvisioningService,
} from '../service'
import {
  AuthenticatedUser,
  BackofficeGuard,
  CurrentUser,
  Public,
  Roles,
} from '../auth'
import { ConfigService } from '../../shared/config/service'

// RFC 0004, Decisão 6.
const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

@Controller('identity')
export class Authentication {
  constructor(
    private readonly tenantProvisioning: TenantProvisioningService,
    private readonly session: SessionService,
    private readonly membership: MembershipService,
    private readonly passwordRecovery: PasswordRecoveryService,
    private readonly config: ConfigService,
  ) {}

  @Post('backoffice/tenants')
  @Public()
  @UseGuards(BackofficeGuard)
  async newTenant(@Body() body: NewTenantBody) {
    return this.tenantProvisioning.createTenant(body)
  }

  @Patch('activate')
  @Public()
  async activeUserAdmin(@Body() body: any) {
    await this.tenantProvisioning.activeAdmin(body)
  }

  @Post('login')
  @Public()
  async login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.session.login(body)
    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined
    if (refreshToken) await this.session.logout(refreshToken)

    res.clearCookie('refreshToken')
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const currentRefreshToken = req.cookies?.refreshToken as string | undefined
    if (!currentRefreshToken) throw new UnauthorizedException()

    const { accessToken, refreshToken } =
      await this.session.refresh(currentRefreshToken)
    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  @Post('tenants/:tenantId/invitations')
  @Roles('ADMIN')
  async inviteMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: InviteMemberBody,
  ) {
    return this.membership.inviteMember(tenantId, user.accountId, body)
  }

  @Post('invitations/:token/accept')
  @Public()
  async acceptInvitation(
    @Param('token') token: string,
    @Body() body: AcceptInvitationBody,
  ) {
    return this.membership.acceptInvitation({ token, ...body })
  }

  @Post('password-resets')
  @Public()
  async requestPasswordReset(@Body() body: RequestPasswordResetBody) {
    return this.passwordRecovery.requestPasswordReset(body.email)
  }

  @Post('password-resets/:token/confirm')
  @Public()
  async confirmPasswordReset(
    @Param('token') token: string,
    @Body() body: ConfirmPasswordResetBody,
  ) {
    await this.passwordRecovery.confirmPasswordReset({ token, ...body })
  }

  // `secure` exige HTTPS — localhost em dev roda HTTP puro, então fica
  // condicionado ao ambiente (senão o browser descarta o cookie em dev).
  private setRefreshCookie(res: Response, refreshToken: string) {
    const isProd = this.config.get('env') === 'production'
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    })
  }
}
