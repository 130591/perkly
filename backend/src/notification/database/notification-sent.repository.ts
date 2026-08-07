import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { NotificationSentEntity } from './notification-sent.entity'

@Injectable()
export class NotificationSentRepository extends DefaultTypeOrmRepository<NotificationSentEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(NotificationSentEntity, dataSource.manager)
  }

  async wasSent(reason: string, idempotencyKey: string): Promise<boolean> {
    return this.existsBy({ reason, idempotencyKey })
  }

  async markSent(
    reason: string,
    idempotencyKey: string,
    channel: string,
  ): Promise<boolean> {
    const result = await this.manager
      .createQueryBuilder()
      .insert()
      .into(NotificationSentEntity)
      .values({ reason, idempotencyKey, channel })
      .orIgnore()
      .returning('id')
      .execute()
    return (result.raw as unknown[]).length > 0
  }
}
