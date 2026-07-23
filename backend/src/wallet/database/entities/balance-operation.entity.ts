import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../database/core/base.entity'

/**
 * Inbox de idempotência de reserve()/release(). `idempotencyKey` único é o
 * guard — reprocessar a mesma operação (retry de rede, redelivery
 * at-least-once) colide no índice único e vira no-op, sem duplicar o efeito
 * no ledger. Mesmo padrão de `payout_page` (payout/database/processed-page.entity.ts).
 */
@Entity('balance_operation')
export class BalanceOperationEntity extends DefaultEntity<BalanceOperationEntity> {
  @Column({ name: 'idempotency_key', type: 'text', unique: true })
  idempotencyKey: string
}
