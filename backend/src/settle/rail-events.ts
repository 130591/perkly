/**
 * Eventos confirmados pela rail — contraparte inbound de `PaymentRail`.
 * Vocabulário de domínio: nada de "pix-payment-in"/"pix-payment-out" ou
 * "CONFIRMED" aqui. O adapter normaliza os DOIS formatos Celcoin (entity +
 * RequestBody legado) PARA isto na borda, igual o normalizeStatus já faz
 * outbound.
 *
 * Serialização: `bigint`/`Date` não sobrevivem ao `JSON.stringify` e o corpo da
 * mensagem SQS é string — o codec (bigint↔string, Date↔ISO) mora na borda do
 * SQS (passo 3). Estes tipos são a forma EM MEMÓRIA, honesta ao domínio.
 */
export type CashInConfirmed = {
  /** Nossa âncora (clientRequestId) — casa com `charge.idempotencyKey`. */
  reference: string
  /** E2E canônico do PIX — chave de dedupe/conciliação, barra o crédito duplo. */
  endToEndId: string
  /** Valor CONFIRMADO no webhook (não o esperado do charge), já em cents. */
  amountCents: bigint
  confirmedAt: Date
}

/**
 * Cash-out confirmado pela rail (webhook `pix-payment-out`) — o Pix ao
 * recipient chegou de verdade. `reference` é o `clientCode` que o payout
 * mandou no `pay()` (== `payout.externalId`, nossa própria âncora de
 * idempotência) — não precisa de tabela de correlação extra.
 *
 * Sem `amountCents`: ao contrário do cash-in (onde o valor CONFIRMADO pelo
 * webhook é a fonte de verdade), aqui o valor já foi decidido por nós no
 * `pay()` — o webhook só confirma sucesso. O formato legado do
 * `pix-payment-out` nem sempre carrega `Amount` (docs/integration.md §4.3);
 * alargar o tipo pra caber isso quando ninguém consome seria dado supérfluo.
 */
export type PayoutConfirmed = {
  reference: string
  endToEndId: string
  confirmedAt: Date
}

export type RailEvent = CashInConfirmed | PayoutConfirmed