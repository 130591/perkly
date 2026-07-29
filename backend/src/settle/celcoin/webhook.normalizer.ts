import {
  CelcoinPixIn,
  CelcoinPixInEntity,
  CelcoinPixInLegacy,
  CelcoinPixOut,
  CelcoinPixOutEntity,
  CelcoinPixOutLegacy,
} from './webhook.schema'

import { CashInConfirmed, PayoutConfirmed } from '../rail-events'

// Tipo de entrada público do normalizer — o spec (e outros consumidores) o
// importam daqui, junto de `normalizeCashIn`/`normalizePayoutConfirmed`.
export type { CelcoinPixIn, CelcoinPixOut } from './webhook.schema'

const CENTS_PER_REAL = 100

const reaisToCents = (reais: number): bigint =>
  BigInt(Math.round(reais * CENTS_PER_REAL))

const anchor = (src: {
  clientRequestId?: string
  transactionIdentification?: string
}): string => {
  const reference = src.clientRequestId ?? src.transactionIdentification

  if (!reference) {
    throw new Error('Celcoin pix-payment-in without correlation anchor')
  }

  return reference
}

export function normalizeCashIn(payload: CelcoinPixIn): CashInConfirmed {
  return 'entity' in payload ? fromEntity(payload) : fromLegacy(payload)
}

function fromEntity(payload: CelcoinPixInEntity): CashInConfirmed {
  if (payload.status !== 'CONFIRMED') {
    throw new Error(`Celcoin pix-payment-in not confirmed: ${payload.status}`)
  }

  return {
    reference: anchor(payload.body),
    endToEndId: payload.body.endToEndId,
    amountCents: reaisToCents(payload.body.amount),
    confirmedAt: new Date(payload.createTimestamp),
  }
}

function fromLegacy(payload: CelcoinPixInLegacy): CashInConfirmed {
  const rb = payload.RequestBody

  if (rb.StatusCode.StatusId !== 2) {
    throw new Error(
      `Celcoin pix-payment-in not confirmed: StatusId ${rb.StatusCode.StatusId}`,
    )
  }

  return {
    reference: anchor(rb),
    endToEndId: rb.EndToEndId,
    amountCents: reaisToCents(rb.Amount),
    confirmedAt: new Date(),
  }
}

export function normalizePayoutConfirmed(
  payload: CelcoinPixOut,
): PayoutConfirmed {
  return 'entity' in payload
    ? payoutFromEntity(payload)
    : payoutFromLegacy(payload)
}

function payoutFromEntity(payload: CelcoinPixOutEntity): PayoutConfirmed {
  if (payload.status !== 'CONFIRMED') {
    throw new Error(`Celcoin pix-payment-out not confirmed: ${payload.status}`)
  }

  return {
    reference: payload.body.clientCode,
    endToEndId: payload.body.endToEndId,
    confirmedAt: new Date(payload.createTimestamp),
  }
}

function payoutFromLegacy(payload: CelcoinPixOutLegacy): PayoutConfirmed {
  const rb = payload.RequestBody

  if (rb.StatusCode.StatusId !== 2) {
    throw new Error(
      `Celcoin pix-payment-out not confirmed: StatusId ${rb.StatusCode.StatusId}`,
    )
  }

  return {
    reference: rb.ClientCode,
    endToEndId: rb.EndToEndId,
    confirmedAt: new Date(),
  }
}
