import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { RefreshTokenEntity } from './entities/refresh-token.entity'

@Injectable()
export class RefreshTokenRepository extends DefaultTypeOrmRepository<RefreshTokenEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(RefreshTokenEntity, dataSource.manager)
  }
}
