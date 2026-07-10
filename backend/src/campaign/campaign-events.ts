/**
 * Eventos outbound do campaign. Dois, de propósito:
 *
 * `CampaignActivated` — magro (só referência). Publicado pelo `confirm` depois
 * que o saldo é reservado. Gatilho do fan-out; NUNCA carrega recipients (uma
 * campanha pode ter dezenas de milhares → estouraria os 256 KB do SQS).
 *
 * `PayoutBatchRequested` — uma PÁGINA limitada de recipients (ex. 500),
 * produzida pelo worker de fan-out do campaign e consumida pelo payout. É a
 * unidade de criação de payout: retry isolado por página, paralelismo por
 * mensagem. `pageId` é a âncora de idempotência (recipients são jsonb sem id
 * próprio, então a página é a unidade de dedupe no at-least-once do SQS).
 *
 * `campaignId` é sempre o `external_id` (UUID) — o id numérico interno jamais
 * cruza a fila. Serialização: `bigint`↔string, `Date`↔ISO no codec.
 */
export type CampaignActivated = {
  campaignId: string
  accountId: string
  occurredAt: Date
}

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
