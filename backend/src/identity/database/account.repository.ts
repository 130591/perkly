import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { AccountEntity } from './entities/account.entity'

type AccountCommand = {
  companyName: string
  cnpj: string
  companyPhone: string
}

@Injectable()
export class Repository extends DefaultTypeOrmRepository<AccountEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(AccountEntity, dataSource.manager)
  }

  async create(input: AccountCommand) {
    const account = await this.save(
      new AccountEntity({
        companyName: input.companyName,
        cnpj: input.cnpj,
        companyPhone: input.companyPhone,
      }),
    )
    return { id: account.id, externalId: account.externalId }
  }
}
