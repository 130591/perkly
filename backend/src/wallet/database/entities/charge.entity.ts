import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../base.entity'

/**
 * `charges` table. `idempotency_key` / `psp_charge_id` are expected to carry a
 * unique constraint at the DB level — a violation surfaces as Postgres error
 * 23505 and is translated to a ConflictException in the repository.
 */
@Entity('charges')
export class ChargeEntity extends DefaultEntity<ChargeEntity> {
  @Column({ name: 'wallet_id', type: 'bigint' })
  walletId: number

  @Column({ name: 'psp_charge_id' })
  pspChargeId: string

  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents: string

  @Column()
  method: string

  @Column()
  status: string

  @Column({ name: 'pix_qr_code', type: 'text', nullable: true })
  pixQrCode: string | null

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null

  @Column({ name: 'idempotency_key' })
  idempotencyKey: string

  @Column({ name: 'transaction_id', type: 'bigint', nullable: true })
  transactionId: number | null
}
