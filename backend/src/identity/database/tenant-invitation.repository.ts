import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { TenantInvitationEntity } from './entities/tenant-invitation.entity'
import { UserRole } from './entities/user.entity'

type InvitationCommand = {
  accountId: number
  email: string
  role: UserRole
  tokenHash: string
  expiresAt: Date
}

@Injectable()
export class TenantInvitationRepository extends DefaultTypeOrmRepository<TenantInvitationEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(TenantInvitationEntity, dataSource.manager)
  }

  async create(input: InvitationCommand) {
    const invitation = await this.save(
      new TenantInvitationEntity({
        accountId: input.accountId,
        email: input.email,
        role: input.role,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      }),
    )
    return { externalId: invitation.externalId }
  }
}
