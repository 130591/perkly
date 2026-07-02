import { CashInConfirmed } from './rail-events'

/**
 * Codec do wire-format de `CashInConfirmed` no SQS.
 *
 * Conhecimento ÚNICO da forma na fila (DRY): `bigint`→string, `Date`→ISO —
 * porque nem `bigint` nem `Date` sobrevivem ao `JSON.stringify`. O `parse`
 * (consumidor) entra no passo 3.2, aqui do lado, pra não divergir do serialize.
 */
export function serializeCashIn(event: CashInConfirmed): string {
  return JSON.stringify({
    reference: event.reference,
    endToEndId: event.endToEndId,
    amountCents: event.amountCents.toString(),
    confirmedAt: event.confirmedAt.toISOString(),
  })
}

/** Inverso de `serializeCashIn` — o consumidor SQS reconstrói o evento em memória. */
export function parseCashIn(body: string): CashInConfirmed {
  const raw = JSON.parse(body) as Record<string, unknown>
  return {
    reference: asString(raw, 'reference'),
    endToEndId: asString(raw, 'endToEndId'),
    amountCents: BigInt(asString(raw, 'amountCents')),
    confirmedAt: new Date(asString(raw, 'confirmedAt')),
  }
}

const asString = (raw: Record<string, unknown>, key: string): string => {
  const value = raw[key]
  if (typeof value !== 'string') {
    throw new Error(`CashInConfirmed payload missing string "${key}"`)
  }
  return value
}
