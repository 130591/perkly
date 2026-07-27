import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { AccountEntity } from './entities/account.entity'

@Injectable()
export class Repository extends DefaultTypeOrmRepository<AccountEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(AccountEntity, dataSource.manager)
  }
}
