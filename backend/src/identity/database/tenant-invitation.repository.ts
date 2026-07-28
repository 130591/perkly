import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { TenantInvitationEntity } from './entities/tenant-invitation.entity'

@Injectable()
export class TenantInvitationRepository extends DefaultTypeOrmRepository<TenantInvitationEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(TenantInvitationEntity, dataSource.manager)
  }
}
