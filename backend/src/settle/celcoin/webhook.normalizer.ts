import {
  CelcoinPixIn,
  CelcoinPixInEntity,
  CelcoinPixInLegacy,
} from './webhook.schema'

import { CashInConfirmed } from '../rail-events'

const CENTS_PER_REAL = 100

const reaisToCents = (reais: number): bigint =>
  BigInt(Math.round(reais * CENTS_PER_REAL))

const anchor = (src: {
  clientRequestId?: string
  transactionIdentification?: string
}): string => {
  const reference =
    src.clientRequestId ??
    src.transactionIdentification

  if (!reference) {
    throw new Error('Celcoin pix-payment-in without correlation anchor')
  }

  return reference
}

export function normalizeCashIn(
  payload: CelcoinPixIn,
): CashInConfirmed {
  return 'entity' in payload
    ? fromEntity(payload)
    : fromLegacy(payload)
}

function fromEntity(
  payload: CelcoinPixInEntity,
): CashInConfirmed {
  if (payload.status !== 'CONFIRMED') {
    throw new Error(
      `Celcoin pix-payment-in not confirmed: ${payload.status}`,
    )
  }

  return {
    reference: anchor(payload.body),
    endToEndId: payload.body.endToEndId,
    amountCents: reaisToCents(payload.body.amount),
    confirmedAt: new Date(payload.createTimestamp),
  }
}

function fromLegacy(
  payload: CelcoinPixInLegacy,
): CashInConfirmed {
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