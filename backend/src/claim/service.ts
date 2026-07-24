import { Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { ClaimRepository } from './database/repository'
import {
  ClaimEventPublisher,
  ClaimConfirmed,
  ClaimExpired,
} from './messaging/events'
import { Claim } from './claim'
import { PayoutCreated } from '../payout/messaging/events'

@Injectable()
export class ClaimService {
  constructor(
    private readonly repository: ClaimRepository,
    private readonly events: ClaimEventPublisher,
  ) {}

  /**
   * Reage a `PayoutCreated` gerando o link de resgate. Idempotente por
   * `payoutId` (o insert já resolve isso — ver `createFromPayoutEvent`), então
   * reentrega do SQS vira no-op sem checagem extra aqui.
   */
  async createFromPayout(event: PayoutCreated): Promise<void> {
    await this.repository.createFromPayoutEvent(event)
  }

  /** Read-model pro destinatário abrir o link. */
  async findById(claimId: string): Promise<Claim> {
    const entity = await this.repository.findOneById(claimId)
    if (!entity) throw new NotFoundException('Claim not found')
    return this.repository.toDomain(entity)
  }

  /**
   * Confirma o resgate: recebe a chave Pix, valida os dois guards do domínio
   * (status + prazo) e publica `ClaimConfirmed`. Lock pessimista na linha
   * (`findByExternalIdForUpdate`) fecha a janela de dois cliques concorrentes
   * no mesmo link — sem ele, os dois passariam no `ensureStatus('pending')`
   * em memória antes de qualquer um escrever.
   */
  @Transactional()
  async confirm(claimId: string, pixKey: string, now = new Date()): Promise<Claim> {
    const entity = await this.repository.findByExternalIdForUpdate(claimId)
    if (!entity) throw new NotFoundException('Claim not found')

    const claim = this.repository.toDomain(entity)
    claim.claim(pixKey, now)
    await this.repository.saveStatus(entity, claim)
    await this.events.publish(new ClaimConfirmed(claim.payoutId, pixKey))
    return claim
  }

  /**
   * Expira UM claim pendente vencido e publica `ClaimExpired`. Retorna
   * `false` quando não há mais trabalho — o worker chama isso em loop até
   * esvaziar, mesmo padrão do `CampaignFanoutWorker.dispatchNext`.
   */
  @Transactional()
  async expireNext(now = new Date()): Promise<boolean> {
    const entity = await this.repository.claimNextExpired(now)
    if (!entity) return false

    const claim = this.repository.toDomain(entity)
    claim.expire()
    await this.repository.saveStatus(entity, claim)
    await this.events.publish(new ClaimExpired(claim.payoutId))
    return true
  }
}
