import {
  PayoutBatchRequested,
  PayoutRecipient,
} from './campaign-events'

/**
 * Codec do wire-format dos eventos do campaign no SQS.
 *
 * Conhecimento ÚNICO da forma na fila (DRY): `bigint`→string, `Date`→ISO —
 * porque nem `bigint` nem `Date` sobrevivem ao `JSON.stringify`. O `parse`
 * (consumidor) mora ao lado do seu `serialize` pra não divergir.
 */
export function serializePayoutBatchRequested(
  event: PayoutBatchRequested,
): string {
  return JSON.stringify({
    pageId: event.pageId,
    campaignId: event.campaignId,
    accountId: event.accountId,
    linksExpireAt: event.linksExpireAt.toISOString(),
    recipients: event.recipients.map(recipient => ({
      name: recipient.name,
      amountCents: recipient.amountCents.toString(),
      channel: recipient.channel,
    })),
  })
}

export function parsePayoutBatchRequested(body: string): PayoutBatchRequested {
  const raw = JSON.parse(body) as Record<string, unknown>
  return {
    pageId: asString(raw, 'pageId'),
    campaignId: asString(raw, 'campaignId'),
    accountId: asString(raw, 'accountId'),
    linksExpireAt: new Date(asString(raw, 'linksExpireAt')),
    recipients: asArray(raw, 'recipients').map(parseRecipient),
  }
}

const parseRecipient = (raw: Record<string, unknown>): PayoutRecipient => ({
  name: asString(raw, 'name'),
  amountCents: BigInt(asString(raw, 'amountCents')),
  channel: parseChannel(asRecord(raw, 'channel')),
})

const parseChannel = (
  raw: Record<string, unknown>,
): PayoutRecipient['channel'] => {
  const type = asString(raw, 'type')
  if (type === 'email') {
    return { type: 'email', address: asString(raw, 'address') }
  }
  if (type === 'phone') {
    return { type: 'phone', number: asString(raw, 'number') }
  }
  throw new Error(`PayoutBatchRequested payload has unknown channel type "${type}"`)
}

const asString = (raw: Record<string, unknown>, key: string): string => {
  const value = raw[key]
  if (typeof value !== 'string') {
    throw new Error(`campaign event payload missing string "${key}"`)
  }
  return value
}

const asArray = (
  raw: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] => {
  const value = raw[key]
  if (!Array.isArray(value)) {
    throw new Error(`campaign event payload missing array "${key}"`)
  }
  return value as Record<string, unknown>[]
}

const asRecord = (
  raw: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const value = raw[key]
  if (typeof value !== 'object' || value === null) {
    throw new Error(`campaign event payload missing object "${key}"`)
  }
  return value as Record<string, unknown>
}
