import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { ClaimRepository } from './database/repository'
import {
  ClaimEventPublisher,
  ClaimConfirmed,
  ClaimExpired,
} from './messaging/events'
import { Claim } from './claim'
import { PayoutCreated } from '../payout/messaging/events'
import { NOTIFIER, Notifier } from '../notification/core/notifier'
import { ConfigService } from '../shared/config/service'

@Injectable()
export class ClaimService {
  constructor(
    private readonly repository: ClaimRepository,
    private readonly events: ClaimEventPublisher,
    private readonly config: ConfigService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  /**
   * Reage a `PayoutCreated` gerando o link de resgate. Idempotente por
   * `payoutId` (o insert já resolve isso — ver `createFromPayoutEvent`), então
   * reentrega do SQS vira no-op sem checagem extra aqui. Publica o pedido de
   * notificação (Notifier.send) dentro da mesma tx que cria o Claim — mesmo
   * padrão do PayoutCreated (RFC 0006, Decisão 5).
   */
  @Transactional()
  async createFromPayout(event: PayoutCreated): Promise<void> {
    await this.repository.createFromPayoutEvent(event)
    const entity = await this.repository.findOne({
      where: { payoutId: event.payoutId },
    })
    if (!entity) {
      throw new Error(`Claim not found for payout ${event.payoutId} right after upsert`)
    }

    await this.notifier.send({
      reason: 'claim-link-ready',
      idempotencyKey: entity.externalId,
      recipient: event.recipient.channel,
      context: {
        name: event.recipient.name,
        amountCents: event.recipient.amountCents.toString(),
        link: `${this.config.get('frontendUrl')}/r/${entity.externalId}`,
        expiresAt: entity.expiresAt.toISOString(),
      },
    })
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
  async confirm(
    claimId: string,
    pixKey: string,
    now = new Date(),
  ): Promise<Claim> {
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
