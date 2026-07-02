import { CashInConfirmed } from '../rail-events'

/**
 * Normaliza o webhook `pix-payment-in` da Celcoin → `CashInConfirmed`.
 *
 * ÚNICA fronteira que conhece o vocabulário Celcoin INBOUND: snake_case, valor
 * em reais, e os DOIS formatos que a doc mantém vivos — `entity` (novo) e
 * `RequestBody` (legado). Ver integration.md §3.3. Nada fora daqui fala Celcoin;
 * é o espelho inbound do `normalizeCharge`/`normalizeStatus` do CelcoinPaymentRail.
 *
 * Só emite um evento para um cash-in de fato CONFIRMADO — um `pix-payment-in`
 * não-confirmado não pode virar `CashInConfirmed` (seria mentira de tipo), então
 * lança. Quem chama (o controller) decide o HTTP: ainda responde 200 pra Celcoin
 * parar de reentregar, mas não enfileira.
 */

const CENTS_PER_REAL = 100

/** Converte reais (número decimal do JSON) → cents. É A borda de conversão. */
const reaisToCents = (reais: number): bigint =>
  // Math.round absorve o ruído de float do decimal; para valores monetários é
  // seguro. Mantemos bigint cents daqui pra dentro (integration.md §Ressalvas).
  BigInt(Math.round(reais * CENTS_PER_REAL))

/** A Celcoin devolve NOSSA âncora ora como clientRequestId, ora como
 *  transactionIdentification (nomenclatura dupla, §7) — aceitamos as duas. */
const anchor = (src: {
  clientRequestId?: string
  transactionIdentification?: string
}): string => {
  const reference = src.clientRequestId ?? src.transactionIdentification
  if (!reference) throw new Error('Celcoin pix-payment-in without correlation anchor')
  return reference
}

// —— formato novo (`entity`) ——————————————————————————————————————————————————
type CelcoinPixInEntity = {
  entity: 'pix-payment-in'
  createTimestamp: string
  status: string
  body: {
    amount: number
    endToEndId: string
    clientRequestId?: string
    transactionIdentification?: string
  }
}

// —— formato legado (`RequestBody`) ————————————————————————————————————————————
type CelcoinPixInLegacy = {
  RequestBody: {
    TransactionType: string
    Amount: number
    EndToEndId: string
    clientRequestId?: string
    transactionIdentification?: string
    StatusCode: { Description: string; StatusId: number }
  }
}

export type CelcoinPixIn = CelcoinPixInEntity | CelcoinPixInLegacy

export function normalizeCashIn(payload: CelcoinPixIn): CashInConfirmed {
  return 'entity' in payload ? fromEntity(payload) : fromLegacy(payload)
}

function fromEntity(payload: CelcoinPixInEntity): CashInConfirmed {
  if (payload.status !== 'CONFIRMED') {
    throw new Error(`Celcoin pix-payment-in not confirmed: ${payload.status}`)
  }
  const { body } = payload
  return {
    reference: anchor(body),
    endToEndId: body.endToEndId,
    amountCents: reaisToCents(body.amount),
    confirmedAt: new Date(payload.createTimestamp),
  }
}

function fromLegacy(payload: CelcoinPixInLegacy): CashInConfirmed {
  const rb = payload.RequestBody
  // StatusId 2 == CONFIRMED (integration.md §4.3).
  if (rb.StatusCode.StatusId !== 2) {
    throw new Error(`Celcoin pix-payment-in not confirmed: StatusId ${rb.StatusCode.StatusId}`)
  }
  return {
    reference: anchor(rb),
    endToEndId: rb.EndToEndId,
    amountCents: reaisToCents(rb.Amount),
    // O formato legado não traz timestamp no payload documentado — marcamos o
    // instante do processamento. (Se a sua conta enviar um campo, plugamos aqui.)
    confirmedAt: new Date(),
  }
}
