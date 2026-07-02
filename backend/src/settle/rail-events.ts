/**
 * Cash-in confirmado pela rail — contraparte inbound de PaymentRail.charge().
 * Vocabulário de domínio: nada de "pix-payment-in" / "CONFIRMED" / reais aqui.
 * O adapter normaliza os DOIS formatos Celcoin (entity + RequestBody legado)
 * PARA isto na borda, igual o normalizeStatus já faz outbound.
 *
 * Estreito de propósito: só cash-in por ora. Quando Payout existir isto vira
 * uma união (`RailEvent = CashInConfirmed | PayoutConfirmed | ...`).
 *
 * Serialização: `bigint`/`Date` não sobrevivem ao `JSON.stringify` e o corpo da
 * mensagem SQS é string — o codec (bigint↔string, Date↔ISO) mora na borda do
 * SQS (passo 3). Este tipo é a forma EM MEMÓRIA, honesta ao domínio.
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