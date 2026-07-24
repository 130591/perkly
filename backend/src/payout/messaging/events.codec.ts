import { PayoutCreated } from './events'
import { Recipient } from '../../campaign/domain/batch'

/**
 * Codec do wire-format de `PayoutCreated` no SQS.
 *
 * Conhecimento ÚNICO da forma na fila (DRY): `bigint`→string, `Date`→ISO —
 * mesmo motivo do codec do campaign. O `parse` (consumidor, no Claim) mora ao
 * lado do `serialize` (produtor, aqui) pra não divergir.
 */
export function serializePayoutCreated(event: PayoutCreated): string {
  return JSON.stringify({
    payoutId: event.payoutId,
    campaignId: event.campaignId,
    recipient: {
      name: event.recipient.name,
      amountCents: event.recipient.amountCents.toString(),
      channel: event.recipient.channel,
    },
    linksExpireAt: event.linksExpireAt.toISOString(),
  })
}

export function parsePayoutCreated(body: string): PayoutCreated {
  const raw = JSON.parse(body) as Record<string, unknown>
  return new PayoutCreated(
    asString(raw, 'payoutId'),
    asString(raw, 'campaignId'),
    parseRecipient(asRecord(raw, 'recipient')),
    new Date(asString(raw, 'linksExpireAt')),
  )
}

const parseRecipient = (raw: Record<string, unknown>): Recipient => ({
  name: asString(raw, 'name'),
  amountCents: BigInt(asString(raw, 'amountCents')),
  channel: parseChannel(asRecord(raw, 'channel')),
})

const parseChannel = (raw: Record<string, unknown>): Recipient['channel'] => {
  const type = asString(raw, 'type')
  if (type === 'email') {
    return { type: 'email', address: asString(raw, 'address') }
  }
  if (type === 'phone') {
    return { type: 'phone', number: asString(raw, 'number') }
  }
  throw new Error(`PayoutCreated payload has unknown channel type "${type}"`)
}

const asString = (raw: Record<string, unknown>, key: string): string => {
  const value = raw[key]
  if (typeof value !== 'string') {
    throw new Error(`PayoutCreated payload missing string "${key}"`)
  }
  return value
}

const asRecord = (
  raw: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const value = raw[key]
  if (typeof value !== 'object' || value === null) {
    throw new Error(`PayoutCreated payload missing object "${key}"`)
  }
  return value as Record<string, unknown>
}
