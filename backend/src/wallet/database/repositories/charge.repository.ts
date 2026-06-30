import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../core/typeorm'
import { ChargeEntity } from '../entities/charge.entity'
import { Charge } from '../../../settle/psp'

@Injectable()
export class ChargeRepository extends DefaultTypeOrmRepository<ChargeEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(ChargeEntity, dataSource.manager)
  }

  findByPspChargeId(pspChargeId: string): Promise<ChargeEntity | null> {
    return this.findOne({ where: { pspChargeId } })
  }

  create(input: {
    walletId: number
    method: string
    idempotencyKey: string
    charge: Charge
  }): Promise<ChargeEntity> {
    return this.save(
      new ChargeEntity({
        walletId: input.walletId,
        method: input.method,
        idempotencyKey: input.idempotencyKey,
        pspChargeId: input.charge.id,
        amountCents: input.charge.amount.toString(),
        status: input.charge.status,
        pixQrCode: input.charge.pix_qr_code,
        expiresAt: input.charge.expires_at,
      }),
    )
  }

  markPaid(id: number, transactionId: number): Promise<unknown> {
    return this.update(id, { status: 'PAID', transactionId })
  }
}
