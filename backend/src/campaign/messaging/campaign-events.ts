/**
 * Evento outbound do campaign para o payout.
 *
 * `PayoutBatchRequested` — uma PÁGINA limitada de recipients (ex. 500),
 * produzida pelo worker de fan-out do campaign e consumida pelo payout. É a
 * unidade de criação de payout: retry isolado por página, paralelismo por
 * mensagem. `pageId` é a âncora de idempotência (recipients são jsonb sem id
 * próprio, então a página é a unidade de dedupe no at-least-once do SQS).
 *
 * A ativação da campanha NÃO gera evento: o fan-out varre o estado durável
 * (`status='active' AND fanned_out_at IS NULL`) em vez de reagir a um sinal que
 * podia se perder (RFC 0002).
 *
 * `campaignId` é sempre o `external_id` (UUID) — o id numérico interno jamais
 * cruza a fila. Serialização: `bigint`↔string, `Date`↔ISO no codec.
 */
export type PayoutBatchRequested = {
  /** `${batchId}:${pageIndex}` — estável, dedupe da página em reentrega. */
  pageId: string
  campaignId: string
  linksExpireAt: Date
  recipients: PayoutRecipient[]
}

export type PayoutRecipient = {
  name: string
  amountCents: bigint
  channel:
    | { type: 'email'; address: string }
    | { type: 'phone'; number: string }
}
