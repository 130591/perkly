import {
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
    await this.activationRepo.create({
      userId: userCreated.id,
      tokenHash,
      expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
    })

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
}
