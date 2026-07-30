import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { UserEntity, UserRole } from './entities/user.entity'

type PendingAdminCommand = {
  email: string
  accountId: number
}

type InvitedMemberCommand = {
  email: string
  name: string
  accountId: number
  role: UserRole
  passwordHash: string
}

@Injectable()
export class UserRepository extends DefaultTypeOrmRepository<UserEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(UserEntity, dataSource.manager)
  }

  /** Primeiro usuário de um tenant novo — nasce sem senha, ativa via token. */
  async createPendingAdmin(input: PendingAdminCommand) {
    const user = await this.save(
      new UserEntity({
        email: input.email,
        accountId: input.accountId,
        role: 'ADMIN',
        status: 'pending_activation',
      }),
    )
    return { id: user.id }
  }

  /** Convite aceito — já nasce com senha e ativo; papel vem do convite. */
  async createFromInvitation(input: InvitedMemberCommand) {
    const user = await this.save(
      new UserEntity({
        email: input.email,
        name: input.name,
        accountId: input.accountId,
        role: input.role,
        status: 'active',
        passwordHash: input.passwordHash,
      }),
    )
    return { externalId: user.externalId }
  }
}
