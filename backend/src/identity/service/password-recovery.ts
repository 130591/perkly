import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { IsNull } from 'typeorm'
import { Password } from '../password'
import {
  UserRepository,
  PasswordResetRepository,
  RefreshTokenRepository,
} from '../database'
import { Token } from '../token'
import { NOTIFIER, Notifier } from '../../notification/core/notifier'
import { ConfigService } from '../../shared/config/service'

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordResetRepo: PasswordResetRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly config: ConfigService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  @Transactional()
  async requestPasswordReset(email: string) {
    const user = await this.userRepo.findOne({ where: { email } })

    // Sempre a mesma resposta, exista ou não o e-mail — evita enumeração de
    // usuários (task 08). Só gera/persiste o token se o usuário existir; o
    // token nunca volta na resposta (diferente de createTenant/inviteMember)
    // — só vai pro e-mail do próprio dono da conta, nunca pro chamador.
    if (user) {
      const { token, tokenHash } = Token.generate()
      const reset = await this.passwordResetRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      })

      await this.notifier.send({
        reason: 'password-reset-requested',
        idempotencyKey: reset.externalId,
        recipient: { type: 'email', address: email },
        context: {
          name: user.name ?? user.email,
          resetLink: `${this.config.get('frontendUrl')}/redefinir-senha/${token}`,
        },
      })
    }

    return {
      message: 'If that e-mail exists, a password reset link has been sent',
    }
  }

  @Transactional()
  async confirmPasswordReset(input: { token: string; password: string }) {
    const now = new Date()
    const reset = await this.passwordResetRepo.findOne({
      where: { tokenHash: Token.hash(input.token), usedAt: IsNull() },
    })
    if (!reset) throw new BadRequestException('Invalid password reset token')

    if (reset.expiresAt.getTime() < now.getTime())
      throw new BadRequestException('Password reset token expired')

    const user = await this.userRepo.findOne({ where: { id: reset.userId } })
    if (!user) throw new NotFoundException('User not found')

    user.passwordHash = await Password.hash(input.password)
    reset.usedAt = now

    await this.userRepo.save(user)
    await this.passwordResetRepo.save(reset)

    // Efeito colateral exclusivo deste fluxo (Decisão 7/US-09): credencial
    // pode ter sido comprometida, então nenhuma sessão antiga sobrevive.
    await this.refreshTokenRepo.revokeAllForUser(user.id)
  }
}
