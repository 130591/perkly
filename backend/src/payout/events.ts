/**
 * Evento de domínio: um payout foi criado (proto-resgate à espera do usuário).
 * `payoutId` é o `external_id` já persistido — o id só existe depois da escrita,
 * então quem publica usa o valor que voltou do repositório, não o agregado cru.
 * Assinante natural é o contexto Claim, ainda não codado: a porta é publicada,
 * o consumidor chega depois.
 */
export class PayoutCreated {
  constructor(
    readonly payoutId: string,
    readonly campaignId: string,
  ) {}
}

/**
 * Porta de publicação de eventos de domínio do payout. Abstrata de propósito: o
 * service depende dela, a implementação concreta (SQS, EventEmitter, …) entra no
 * módulo — nada de domínio conhece o transporte.
 */
export abstract class DomainEventPublisher {
  abstract publish(event: PayoutCreated): Promise<void>
}
