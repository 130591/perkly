import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../../database/core/typeorm'
import { ChargeEntity } from '../entities/charge.entity'
import { Charge } from '../../../settle/payment-rail'

@Injectable()
export class ChargeRepository extends DefaultTypeOrmRepository<ChargeEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(ChargeEntity, dataSource.manager)
  }

  /**
   * Trava a linha do charge (SELECT … FOR UPDATE) pela nossa âncora de correlação
   * (`idempotencyKey` = `reference` do webhook), serializando confirmações
   * concorrentes do mesmo cash-in. Precisa rodar dentro de `@Transactional`.
   */
  findByIdempotencyKeyForUpdate(idempotencyKey: string): Promise<ChargeEntity | null> {
    return this.findOne({
      where: { idempotencyKey },
      lock: { mode: 'pessimistic_write' },
    })
  }

  create(input: {
    walletId: number
    method: string
    idempotencyKey: string
    charge: Charge
  }): Promise<ChargeEntity> {
    const { charge } = input
    return this.save(
      new ChargeEntity({
        walletId: input.walletId,
        method: input.method,
        idempotencyKey: input.idempotencyKey,
        pspChargeId: charge.id,
        amountCents: charge.amountCents.toString(),
        status: charge.status,
        pixQrCode: charge.method === 'pix' ? charge.pixQrCode : null,
        expiresAt: charge.expiresAt,
      }),
    )
  }

  markPaid(id: number, transactionId: number): Promise<unknown> {
    return this.update(id, { status: 'PAID', transactionId })
  }
}
