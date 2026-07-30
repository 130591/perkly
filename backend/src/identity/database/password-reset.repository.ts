import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { PasswordResetEntity } from './entities/password-reset.entity'

type PasswordResetCommand = {
  userId: number
  tokenHash: string
  expiresAt: Date
}

@Injectable()
export class PasswordResetRepository extends DefaultTypeOrmRepository<PasswordResetEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(PasswordResetEntity, dataSource.manager)
  }

  async create(input: PasswordResetCommand): Promise<void> {
    await this.save(
      new PasswordResetEntity({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      }),
    )
  }
}
