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
  TenantInvitationRepository,
  UserRole,
} from '../database'
import { Token } from '../token'
import { NOTIFIER, Notifier } from '../../notification/core/notifier'
import { ConfigService } from '../../shared/config/service'

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000

@Injectable()
export class MembershipService {
  constructor(
    private readonly repository: Repository,
    private readonly invitationRepo: TenantInvitationRepository,
    private readonly userRepo: UserRepository,
    private readonly config: ConfigService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  @Transactional()
  async inviteMember(
    tenantExternalId: string,
    callerAccountId: string,
    input: { email: string; role: UserRole },
  ) {
    // 404, não 403: revelar que o tenant existe (só que é de outra conta)
    // vazaria informação sobre contas alheias.
    if (tenantExternalId !== callerAccountId)
      throw new NotFoundException('Tenant not found')

    const account = await this.repository.findOneById(tenantExternalId)
    if (!account) throw new NotFoundException('Tenant not found')

    const { token, tokenHash } = Token.generate()
    const invitation = await this.invitationRepo.create({
      accountId: account.id,
      email: input.email,
      role: input.role,
      tokenHash,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })

    await this.notifier.send({
      reason: 'member-invited',
      idempotencyKey: invitation.externalId,
      recipient: { type: 'email', address: input.email },
      context: {
        name: input.email,
        tenantName: account.companyName,
        inviteLink: `${this.config.get('frontendUrl')}/convite/${token}?email=${encodeURIComponent(input.email)}`,
      },
    })

    // Token cru continua na resposta como fallback manual enquanto
    // SENDGRID_API_KEY não está configurada — remover quando o e-mail
    // estiver confirmadamente funcionando.
    return { id: invitation.externalId, invitationToken: token }
  }

  /** Read-model for the team screen — see database/sql/team-members.sql. */
  async listMembers(tenantExternalId: string, callerAccountId: string) {
    if (tenantExternalId !== callerAccountId)
      throw new NotFoundException('Tenant not found')

    const account = await this.repository.findOneById(tenantExternalId)
    if (!account) throw new NotFoundException('Tenant not found')

    return this.repository.findMembers(account.id)
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

    const user = await this.userRepo.createFromInvitation({
      email: invitation.email,
      name: input.name,
      accountId: invitation.accountId,
      role: invitation.role,
      passwordHash: await Password.hash(input.password),
    })

    invitation.usedAt = now
    await this.invitationRepo.save(invitation)

    return { id: user.externalId }
  }
}
