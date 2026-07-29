import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { IsNull } from 'typeorm'
import { Password } from '../password'
import {
  UserRepository,
  PasswordResetEntity,
  PasswordResetRepository,
  RefreshTokenRepository,
} from '../database'
import { Token } from '../token'

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordResetRepo: PasswordResetRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
  ) {}

  async requestPasswordReset(email: string) {
    const user = await this.userRepo.findOne({ where: { email } })

    // Sempre a mesma resposta, exista ou não o e-mail — evita enumeração de
    // usuários (task 08). Só gera/persiste o token se o usuário existir; o
    // token nunca volta na resposta (diferente de createTenant/inviteMember,
    // que são acionados por quem já sabe que a conta existe — aqui é
    // autoatendimento não-autenticado, devolver o token de volta reabriria
    // exatamente a enumeração que a resposta genérica existe pra evitar).
    if (user) {
      const { tokenHash } = Token.generate()
      await this.passwordResetRepo.save(
        new PasswordResetEntity({
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        }),
      )
      // TODO: disparo do e-mail de recuperação fica para o módulo de
      // notificação (mesma dívida de createTenant/inviteMember).
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
