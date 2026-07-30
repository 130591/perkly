import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { UserActivationEntity } from './entities/user-activation.entity'

type UserActivationCommand = {
  userId: number
  tokenHash: string
  expiresAt: Date
}

@Injectable()
export class UserActivationRepository extends DefaultTypeOrmRepository<UserActivationEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(UserActivationEntity, dataSource.manager)
  }

  async create(input: UserActivationCommand): Promise<void> {
    await this.save(
      new UserActivationEntity({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      }),
    )
  }
}
