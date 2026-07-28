import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { PasswordResetEntity } from './entities/password-reset.entity'

@Injectable()
export class PasswordResetRepository extends DefaultTypeOrmRepository<PasswordResetEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(PasswordResetEntity, dataSource.manager)
  }
}
