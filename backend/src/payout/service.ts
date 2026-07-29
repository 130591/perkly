import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import { PayoutRepository } from './database/repository'
import { PayoutBatchRequested } from '../campaign/messaging/campaign-events'
import { Payout } from './payout'
import { DomainEventPublisher, PayoutCreated } from './messaging/events'
import { ClaimConfirmed, ClaimExpired } from '../claim/messaging/events'
import { PayoutConfirmed } from '../settle/rail-events'
import { PAYMENT_RAIL, PaymentRail } from '../settle/payment-rail'
import {
  BALANCE_RESERVATION,
  BalanceReservation,
} from '../wallet/balance-reservation'

@Injectable()
export class PayoutService {
  constructor(
    private readonly repository: PayoutRepository,
    private readonly events: DomainEventPublisher,
    @Inject(PAYMENT_RAIL) private readonly rail: PaymentRail,
    @Inject(BALANCE_RESERVATION)
    private readonly reservation: BalanceReservation,
  ) {}

  // Uma página de recipients → payouts, numa transação. Idempotente por `pageId`
  // (SQS é at-least-once): reprocessar a mesma página não pode duplicar payout.
  @Transactional()
  async createFromBatch(request: PayoutBatchRequested): Promise<void> {
    // Reivindica a página antes de qualquer escrita: se já foi processada numa
    // entrega anterior, no-op — nem payout nem evento duplicados. Claim + inserts
    // na mesma tx: ou tudo commita, ou nada (e a reentrega reprocessa do zero).
    const claimed = await this.repository.claimPage(request.pageId)
    if (!claimed) return

    for (const recipient of request.recipients) {
      const payout = Payout.draft({
        campaignId: request.campaignId,
        accountId: request.accountId,
        recipient,
        linksExpireAt: request.linksExpireAt,
      })

      const saved = await this.repository.create(payout)
      await this.events.publish(
        new PayoutCreated(
          saved.externalId,
          request.campaignId,
          recipient,
          request.linksExpireAt,
        ),
      )
    }
  }

  /**
   * Reage à confirmação do resgate: persiste a chave Pix e o novo status
   * ANTES de acionar o PSP (persist-intent-before-PSP, docs/integration.md
   * §4.2) — se o processo cair entre os dois passos, o retry ainda vê
   * `pending` e reprocessa do zero. Não é `@Transactional`: chamar o rail é
   * I/O externo, não deve viver dentro de uma transação de banco (mesmo
   * motivo de `Wallet.addBalance`).
   */
  async startProcessing(event: ClaimConfirmed): Promise<void> {
    const entity = await this.repository.findOneById(event.payoutId)
    if (!entity) throw new NotFoundException('Payout not found')
    if (entity.status !== 'pending') return // reentrega — já em processamento

    const payout = this.repository.toDomain(entity)
    payout.startProcessing(event.pixKey)
    await this.repository.saveStatus(entity, payout)

    await this.rail.pay({
      amountCents: payout.recipient.amountCents,
      pixKey: event.pixKey,
      reference: entity.externalId,
    })
  }

  /**
   * Reage à expiração do resgate: marca o payout expirado e libera a reserva
   * no wallet (reserved → available) — o link nunca foi confirmado.
   * `reservation.release` é `@Transactional` também, então propaga pra mesma
   * transação (mesmo padrão de `CampaignService.confirm` com `reserve`).
   */
  @Transactional()
  async expire(event: ClaimExpired): Promise<void> {
    const entity = await this.repository.findOneById(event.payoutId)
    if (!entity) throw new NotFoundException('Payout not found')
    if (entity.status !== 'pending') return // reentrega — já tratado

    const payout = this.repository.toDomain(entity)
    payout.expire()
    await this.repository.saveStatus(entity, payout)

    await this.reservation.release({
      accountId: payout.accountId,
      amountCents: payout.recipient.amountCents,
      idempotencyKey: `payout-expire:${event.payoutId}`,
    })
  }

  /**
   * Reage à confirmação do PSP (webhook `pix-payment-out`): consome a reserva
   * de vez (reserved → external) e marca o payout pago. Transacional — ao
   * contrário de `startProcessing`, aqui não tem I/O externo (settle no
   * wallet + markPaid são ambos internos). Lock (`findByExternalIdForUpdate`)
   * porque o webhook da Celcoin reentrega até 20x (docs/integration.md §6).
   */
  @Transactional()
  async confirmPayment(event: PayoutConfirmed): Promise<void> {
    const entity = await this.repository.findByExternalIdForUpdate(
      event.reference,
    )
    if (!entity) throw new NotFoundException('Payout not found')
    if (entity.status === 'paid') return // reentrega do webhook — já liquidado

    const payout = this.repository.toDomain(entity)
    payout.markPaid()
    await this.repository.saveStatus(entity, payout)

    await this.reservation.settle({
      accountId: payout.accountId,
      amountCents: payout.recipient.amountCents,
      fee: 0n,
      idempotencyKey: `payout-settle:${event.reference}`,
    })
  }
}
