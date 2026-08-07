import {
  Inject,
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { IsNull } from 'typeorm'
import { Password } from '../password'
import {
  Repository,
  UserRepository,
  UserActivationRepository,
} from '../database'
import { Token } from '../token'
import { NOTIFIER, Notifier } from '../../notification/core/notifier'
import { ConfigService } from '../../shared/config/service'

type NewTenant = {
  email: string
  companyName: string
  cnpj: string
  companyPhone: string
}

// RFC 0004, Decisão 12.
const ACTIVATION_TTL_MS = 5 * 24 * 60 * 60 * 1000

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly repository: Repository,
    private readonly userRepo: UserRepository,
    private readonly activationRepo: UserActivationRepository,
    private readonly config: ConfigService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  @Transactional()
  async createTenant(input: NewTenant) {
    const exists = await this.repository.findOne({
      where: { cnpj: input.cnpj },
    })
    if (exists)
      throw new ConflictException('Account with this CNPJ already exists')

    const accountCreated = await this.repository.create({
      cnpj: input.cnpj,
      companyName: input.companyName,
      companyPhone: input.companyPhone,
    })

    const userCreated = await this.userRepo.createPendingAdmin({
      email: input.email,
      accountId: accountCreated.id,
    })

    const { token, tokenHash } = Token.generate()
    const activation = await this.activationRepo.create({
      userId: userCreated.id,
      tokenHash,
      expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
    })

    await this.notifier.send({
      reason: 'tenant-activation',
      idempotencyKey: activation.externalId,
      recipient: { type: 'email', address: input.email },
      context: {
        name: input.companyName,
        activationLink: `${this.config.get('frontendUrl')}/ativar/${token}`,
      },
    })

    // Token cru continua na resposta como fallback manual enquanto
    // SENDGRID_API_KEY não está configurada (envio real ainda não sai) —
    // remover quando o e-mail estiver confirmadamente funcionando.
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
}
