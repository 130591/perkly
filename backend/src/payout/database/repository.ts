import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../database/core/typeorm'
import { PayoutEntity } from './payout.entity'
import { ProcessedPageEntity } from './processed-page.entity'
import { Payout } from '../payout'

@Injectable()
export class PayoutRepository extends DefaultTypeOrmRepository<PayoutEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(PayoutEntity, dataSource.manager)
  }

  /** Mapeia o agregado `Payout` para a linha e persiste (domínio → entity). */
  create(payout: Payout): Promise<PayoutEntity> {
    return this.save(
      new PayoutEntity({
        campaignId: payout.campaignId,
        accountId: payout.accountId,
        recipientName: payout.recipient.name,
        amountCents: payout.recipient.amountCents.toString(),
        channel: payout.recipient.channel,
        status: payout.status,
        expiresAt: payout.linksExpireAt,
      }),
    )
  }

  /**
   * Reivindica a página no inbox de idempotência. `INSERT ... ON CONFLICT DO
   * NOTHING RETURNING`: `true` se ESTA chamada inseriu (dona do processamento),
   * `false` se o `pageId` já existia (redelivery → o chamador faz no-op). O
   * índice único serializa entregas concorrentes — a 2ª bloqueia até a 1ª
   * commitar/rollbackar, então nunca duplica nem perde. Usa o `manager`
   * transacional, logo entra na mesma tx do `createFromBatch`.
   */
  async claimPage(pageId: string): Promise<boolean> {
    const result = await this.manager
      .createQueryBuilder()
      .insert()
      .into(ProcessedPageEntity)
      .values({ pageId })
      .orIgnore()
      .returning('page_id')
      .execute()
    return result.raw.length > 0
  }
}
