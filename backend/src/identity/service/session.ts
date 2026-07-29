import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Password } from '../password'
import {
  Repository,
  AccountEntity,
  UserEntity,
  UserRepository,
  RefreshTokenEntity,
  RefreshTokenRepository,
} from '../database'
import { Token } from '../token'

// RFC 0004, Decisão 6.
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const REFRESH_GRACE_PERIOD_MS = 30 * 1000

@Injectable()
export class SessionService {
  constructor(
    private readonly repository: Repository,
    private readonly userRepo: UserRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly jwt: JwtService,
  ) {}

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
