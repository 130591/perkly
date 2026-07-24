/**
 * Eventos de saída do Claim. Nenhum assinante ainda: o Payout, que reagiria
 * com `startProcessing()`/`expire()` (+ `wallet.release()` no caso do
 * expirado), ainda não tem consumer — mesmo estágio em que `PayoutCreated`
 * ficou até o Claim existir. A porta é publicada agora pra não travar o
 * domínio; o transporte real entra quando o Payout assinar.
 */
export class ClaimConfirmed {
  constructor(
    readonly payoutId: string,
    readonly pixKey: string,
  ) {}
}

export class ClaimExpired {
  constructor(readonly payoutId: string) {}
}

export type ClaimEvent = ClaimConfirmed | ClaimExpired

/**
 * Porta de publicação de eventos do Claim. Abstrata de propósito, igual
 * `DomainEventPublisher` do payout: o service depende dela, a implementação
 * concreta entra no módulo.
 */
export abstract class ClaimEventPublisher {
  abstract publish(event: ClaimEvent): Promise<void>
}
