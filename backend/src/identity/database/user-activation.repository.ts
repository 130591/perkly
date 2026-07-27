import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { UserActivationEntity } from './entities/user-activation.entity'

@Injectable()
export class UserActivationRepository extends DefaultTypeOrmRepository<UserActivationEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(UserActivationEntity, dataSource.manager)
  }
}
