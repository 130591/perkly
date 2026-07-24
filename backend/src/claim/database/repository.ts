import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../database/core/typeorm'
import { ClaimEntity } from './claim.entity'
import { Claim, ClaimStatus } from '../claim'
import { PayoutCreated } from '../../payout/messaging/events'

@Injectable()
export class ClaimRepository extends DefaultTypeOrmRepository<ClaimEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(ClaimEntity, dataSource.manager)
  }

  /**
   * Cria o Claim a partir do evento numa única `INSERT ... ON CONFLICT
   * (payout_id) DO NOTHING`: `payoutId` já é a chave de idempotência (1 Claim
   * por payout, pra sempre), então redelivery do `PayoutCreated` (SQS é
   * at-least-once) colide no índice único e vira no-op — sem precisar de uma
   * tabela de inbox separada como o payout usa pra página. Retorna `true` se
   * ESTA chamada criou a linha, `false` se já existia.
   */
  async createFromPayoutEvent(event: PayoutCreated): Promise<boolean> {
    const result = await this.manager
      .createQueryBuilder()
      .insert()
      .into(ClaimEntity)
      .values({
        payoutId: event.payoutId,
        contactName: event.recipient.name,
        channel: event.recipient.channel,
        amountCents: event.recipient.amountCents.toString(),
        status: 'pending' as ClaimStatus,
        expiresAt: event.linksExpireAt,
      })
      .orIgnore()
      .returning('payout_id')
      .execute()
    return (result.raw as unknown[]).length > 0
  }

  /**
   * Busca por `externalId` (o token do link) travando a linha (`FOR UPDATE`,
   * sem skip) — usada por `confirm()`, que decide com base no status atual.
   * Serializa dois cliques concorrentes no mesmo link: o segundo espera o
   * primeiro commitar e então vê `status='claimed'`, falhando limpo em vez de
   * também confirmar. Mesmo padrão de `WalletRepository.findByAccountIdForUpdate`.
   */
  findByExternalIdForUpdate(externalId: string): Promise<ClaimEntity | null> {
    return this.findOne({
      where: { externalId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  /**
   * Reivindica UM claim pendente já vencido, travando a linha (`FOR UPDATE
   * SKIP LOCKED`) — mesmo padrão do `CampaignRepository.claimPendingFanout`.
   * `null` = sem trabalho. Deve rodar na tx do worker: o lock some no commit
   * (grava `status='expired'`) ou no rollback (crash → devolve à varredura).
   */
  async claimNextExpired(now: Date): Promise<ClaimEntity | null> {
    return this.manager
      .createQueryBuilder(ClaimEntity, 'claim')
      .where('claim.status = :status', {
        status: 'pending' satisfies ClaimStatus,
      })
      .andWhere('claim.expiresAt <= :now', { now })
      .andWhere('claim.deletedAt IS NULL')
      .orderBy('claim.id', 'ASC')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .limit(1)
      .getOne()
  }

  /** Persiste a transição de status (e a chave Pix, se veio de `claim()`). */
  saveStatus(entity: ClaimEntity, claim: Claim): Promise<ClaimEntity> {
    entity.status = claim.status
    entity.pixKey = claim.pixKey
    return this.save(entity)
  }

  toDomain(entity: ClaimEntity): Claim {
    return Claim.hydrate({
      payoutId: entity.payoutId,
      contact: { name: entity.contactName, channel: entity.channel },
      amountCents: BigInt(entity.amountCents),
      expiresAt: entity.expiresAt,
      status: entity.status as ClaimStatus,
      pixKey: entity.pixKey,
    })
  }
}
