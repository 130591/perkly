import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm'
import { DefaultEntity } from '../../database/core/base.entity'
import { Channel } from '../domain/batch'

/**
 * Recipients are stored inline on the batch as jsonb — proto-payouts, not yet
 * independently queried. `amountCents` is a decimal string (not a JSON number)
 * so the domain bigint survives the round-trip without float loss. They become
 * first-class Payout rows when the confirmation flow lands.
 */
type StoredRecipient = {
  name: string
  amountCents: string
  channel: Channel
}

// CampaignEntity precede BatchEntity de propósito: `emitDecoratorMetadata`
// emite o `design:type` de `batch.campaign` de forma eager, então a classe
// referenciada já precisa estar inicializada. A volta (`batches: BatchEntity[]`)
// vira metadata `Array`, sem referência direta — por isso não exige o inverso.
@Entity('campaigns')
export class CampaignEntity extends DefaultEntity<CampaignEntity> {
  // external_id da conta dona (contexto wallet). Referência solta, não FK: o
  // schema do campaign não conhece as tabelas do wallet.
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string

  @Column()
  name: string

  @Column({ type: 'text' })
  message: string

  @Column({ name: 'transfer_type' })
  transferType: string

  @Column()
  status: string

  // Marcador de despacho assíncrono (não é estado de domínio): NULL enquanto o
  // fan-out não emitiu as páginas de payout. O `CampaignFanoutWorker` varre
  // `status='active' AND fanned_out_at IS NULL` — a linha é a fila de trabalho,
  // sem evento a se perder (RFC 0002). Gravado só ao final do fan-out.
  @Column({ name: 'fanned_out_at', type: 'timestamptz', nullable: true })
  fannedOutAt: Date | null

  @OneToMany(() => BatchEntity, (batch) => batch.campaign, { cascade: true })
  batches: BatchEntity[]
}

@Entity('batches')
export class BatchEntity extends DefaultEntity<BatchEntity> {
  @ManyToOne(() => CampaignEntity, (campaign) => campaign.batches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: CampaignEntity

  @Column({ name: 'links_expire_at', type: 'timestamptz' })
  linksExpireAt: Date

  @Column({ type: 'jsonb' })
  recipients: StoredRecipient[]
}
