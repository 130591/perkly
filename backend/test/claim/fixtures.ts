import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { Message } from '@aws-sdk/client-sqs'
import { ClaimEntity } from '../../src/claim/database/claim.entity'
import { PayoutCreated } from '../../src/payout/messaging/events'
import { serializePayoutCreated } from '../../src/payout/messaging/events.codec'

export const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000)
export const PAST = new Date(Date.now() - 60_000)

type PayoutCreatedOverrides = {
  recipientName?: string
  amountCents?: bigint
  linksExpireAt?: Date
}

/**
 * Caixa preta: monta a mensagem SQS exatamente como o produtor (payout) a
 * serializa. Compartilhado entre as specs do Claim pra não repetir o wire
 * format em cada arquivo — se o codec do payout mudar de forma, só este
 * fixture acompanha.
 */
export function payoutCreatedMessage(
  payoutId: string,
  overrides: PayoutCreatedOverrides = {},
): Message {
  const event = new PayoutCreated(
    payoutId,
    randomUUID(),
    {
      name: overrides.recipientName ?? 'Ana',
      amountCents: overrides.amountCents ?? 5000n,
      channel: { type: 'email', address: 'ana@example.com' },
    },
    overrides.linksExpireAt ?? FUTURE,
  )
  return { Body: serializePayoutCreated(event) }
}

export const reloadClaimByPayoutId = (ds: DataSource, payoutId: string) =>
  ds.getRepository(ClaimEntity).findOneByOrFail({ payoutId })
