import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Transactional } from 'typeorm-transactional'
import { IsNull } from 'typeorm'
import { Password } from './password'
import {
  Repository,
  AccountEntity,
  UserEntity,
  UserRepository,
  UserActivationEntity,
  UserActivationRepository,
  RefreshTokenEntity,
  RefreshTokenRepository,
  TenantInvitationEntity,
  TenantInvitationRepository,
  UserRole,
} from './database'
import { Token } from './token'

type NewTenant = {
  email: string
  companyName: string
  cnpj: string
  companyPhone: string
}

// RFC 0004, Decisão 12.
const ACTIVATION_TTL_MS = 5 * 24 * 60 * 60 * 1000
const INVITATION_TTL_MS = 48 * 60 * 60 * 1000
// RFC 0004, Decisão 6.
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const REFRESH_GRACE_PERIOD_MS = 30 * 1000

@Injectable()
export class Service {
  constructor(
    private readonly repository: Repository,
    private readonly userRepo: UserRepository,
    private readonly activationRepo: UserActivationRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly invitationRepo: TenantInvitationRepository,
    private readonly jwt: JwtService,
  ) {}

  @Transactional()
  async createTenant(input: NewTenant) {
    const exists = await this.repository.findOne({
      where: { cnpj: input.cnpj },
    })
    if (exists)
      throw new ConflictException('Account with this CNPJ already exists')

    const accountCreated = await this.repository.save(
      new AccountEntity({
        cnpj: input.cnpj,
        companyName: input.companyName,
        companyPhone: input.companyPhone,
      }),
    )

    const userCreated = await this.userRepo.save(
      new UserEntity({
        email: input.email,
        accountId: accountCreated.id,
        role: 'ADMIN',
        status: 'pending_activation',
      }),
    )

    const { token, tokenHash } = Token.generate()
    await this.activationRepo.save(
      new UserActivationEntity({
        userId: userCreated.id,
        tokenHash,
        expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
      }),
    )

    // TODO: disparo do e-mail de boas-vindas/ativação fica para o módulo de
    // notificação (fora do escopo desta task). Até lá, o token cru volta na
    // resposta pra dar pra ativar manualmente.
    return { id: accountCreated.externalId, activationToken: token }
  }

  @Transactional()
  async activeAdmin(input: { token: string; password: string }) {
    const now = new Date()
    const activation = await this.activationRepo.findOne({
      where: { tokenHash: Token.hash(input.token), usedAt: IsNull() },
    })
    if (!activation) throw new BadRequestException('Invalid activation token')

    if (activation.expiresAt.getTime() < now.getTime())
      throw new BadRequestException('Activation token expired')

    const user = await this.userRepo.findOne({
      where: { id: activation.userId },
    })
    if (!user) throw new NotFoundException('Admin User not found')

    user.passwordHash = await Password.hash(input.password)
    user.status = 'active'
    activation.usedAt = now

    await this.userRepo.save(user)
    await this.activationRepo.save(activation)
  }

  async login(input: { email: string; password: string }) {
    const user = await this.userRepo.findOne({
      where: { email: input.email },
    })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    if (user.status === 'pending_activation')
      throw new UnauthorizedException(
        'Account not activated yet — check your welcome e-mail',
      )

    if (
      user.status !== 'active' ||
      !user.passwordHash ||
      !(await Password.verify(user.passwordHash, input.password))
    )
      throw new UnauthorizedException('Invalid credentials')

    const account = await this.repository.findOneByPk(user.accountId)
    if (!account) throw new UnauthorizedException('Invalid credentials')

    return this.issueTokens(user, account)
  }

  async refresh(refreshToken: string) {
    const now = new Date()
    const session = await this.refreshTokenRepo.findOne({
      where: { tokenHash: Token.hash(refreshToken) },
    })
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < now.getTime()
    )
      throw new UnauthorizedException('Invalid refresh token')

    if (session.usedAt) {
      const elapsedMs = now.getTime() - session.usedAt.getTime()
      if (elapsedMs > REFRESH_GRACE_PERIOD_MS) {
        // Reuso fora da janela — sinal de roubo, não retry de rede.
        await this.refreshTokenRepo.revokeAllForUser(session.userId)
        throw new UnauthorizedException('Refresh token reuse detected')
      }
      // Dentro da janela: retry de rede legítimo — não pune, só rotaciona
      // de novo (sem reescrever usedAt, que já está marcado).
    } else {
      session.usedAt = now
      await this.refreshTokenRepo.save(session)
    }

    const user = await this.userRepo.findOne({
      where: { id: session.userId },
    })
    if (!user || user.status !== 'active')
      throw new UnauthorizedException('Invalid refresh token')

    const account = await this.repository.findOneByPk(user.accountId)
    if (!account) throw new UnauthorizedException('Invalid refresh token')

    return this.issueTokens(user, account)
  }

  async inviteMember(
    tenantExternalId: string,
    input: { email: string; role: UserRole },
  ) {
    const account = await this.repository.findOneById(tenantExternalId)
    if (!account) throw new NotFoundException('Tenant not found')

    const { token, tokenHash } = Token.generate()
    const invitation = await this.invitationRepo.save(
      new TenantInvitationEntity({
        accountId: account.id,
        email: input.email,
        role: input.role,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      }),
    )

    // TODO: disparo do e-mail de convite fica para o módulo de notificação
    // (mesma dívida do createTenant). Até lá, o token cru volta na resposta.
    return { id: invitation.externalId, invitationToken: token }
  }

  @Transactional()
  async acceptInvitation(input: {
    token: string
    name: string
    password: string
  }) {
    const now = new Date()
    const invitation = await this.invitationRepo.findOne({
      where: { tokenHash: Token.hash(input.token), usedAt: IsNull() },
    })
    if (!invitation) throw new BadRequestException('Invalid invitation token')

    if (invitation.expiresAt.getTime() < now.getTime())
      throw new BadRequestException('Invitation token expired')

    const alreadyMember = await this.userRepo.findOne({
      where: { email: invitation.email },
    })
    if (alreadyMember)
      throw new ConflictException('User with this e-mail already exists')

    const user = await this.userRepo.save(
      new UserEntity({
        email: invitation.email,
        name: input.name,
        accountId: invitation.accountId,
        role: invitation.role,
        status: 'active',
        passwordHash: await Password.hash(input.password),
      }),
    )

    invitation.usedAt = now
    await this.invitationRepo.save(invitation)

    return { id: user.externalId }
  }

  async logout(refreshToken: string) {
    const session = await this.refreshTokenRepo.findOne({
      where: { tokenHash: Token.hash(refreshToken) },
    })
    // Cookie ausente/já inválido: logout ainda "funciona" do ponto de vista
    // do cliente — não há sessão pra revogar, não é erro.
    if (!session) return

    session.revokedAt = new Date()
    await this.refreshTokenRepo.save(session)
  }

  /** Emissão de access+refresh — compartilhada entre `login` e `refresh`. */
  private async issueTokens(user: UserEntity, account: AccountEntity) {
    const accessToken = this.jwt.sign({
      sub: user.externalId,
      accountId: account.externalId,
      role: user.role,
    })

    const { token: refreshToken, tokenHash } = Token.generate()
    await this.refreshTokenRepo.save(
      new RefreshTokenEntity({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      }),
    )

    return { accessToken, refreshToken }
  }
}
