import { Recipient } from '../../campaign/domain/batch'

/**
 * Evento de domínio: um payout foi criado (proto-resgate à espera do usuário).
 * `payoutId` é o `external_id` já persistido — o id só existe depois da escrita,
 * então quem publica usa o valor que voltou do repositório, não o agregado cru.
 *
 * Carrega `recipient` (nome + canal + valor) e `linksExpireAt` — gordo o
 * suficiente pra o Claim se hidratar sozinho, sem consultar o payout de volta.
 * `Recipient` é vocabulário do próprio payout (já usado em `Payout.recipient`);
 * é o Claim, na borda do seu consumer, quem traduz pra `ClaimContact` — a
 * dependência flui de payout pra claim, nunca o contrário.
 */
export class PayoutCreated {
  constructor(
    readonly payoutId: string,
    readonly campaignId: string,
    readonly recipient: Recipient,
    readonly linksExpireAt: Date,
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
