import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { Message } from '@aws-sdk/client-sqs'
import { PayoutEntity } from '../../src/payout/database/payout.entity'
import { PayoutStatus } from '../../src/payout/payout'
import { AccountEntity } from '../../src/identity/database/entities/account.entity'
import { Wallet } from '../../src/wallet/service'
import { seedWallet } from '../wallet/setup'
import { ClaimConfirmed, ClaimExpired } from '../../src/claim/messaging/events'
import { serializeClaimConfirmed, serializeClaimExpired } from '../../src/claim/messaging/events.codec'
import { PayoutConfirmed } from '../../src/settle/rail-events'
import { serializePayoutConfirmed } from '../../src/settle/rail-events.codec'

/**
 * Cria uma conta com carteira funded + reserved — o estado que um payout
 * pending já pressupõe (a reserva foi feita na confirmação da campanha, bem
 * antes do Claim/Payout entrarem em cena). Reusa o `Wallet` real (addBalance →
 * confirmBalance → reserve), mesma técnica de `reserve.integration-spec.ts`.
 */
export async function seedFundedReservedAccount(
  ds: DataSource,
  wallet: Wallet,
  amountCents: bigint,
): Promise<AccountEntity> {
  const { account } = await seedWallet(ds)
  const fundKey = `fund:${account.externalId}`

  await wallet.addBalance({
    method: 'pix',
    amount: amountCents,
    accountId: account.externalId,
    idempotencyKey: fundKey,
  })
  await wallet.confirmBalance({
    reference: fundKey,
    endToEndId: `E-${fundKey}`,
    amountCents,
    confirmedAt: new Date(),
  })
  await wallet.reserve({
    accountId: account.externalId,
    amountCents,
    idempotencyKey: `reserve:${account.externalId}`,
  })

  return account
}

type SeedPayoutOverrides = {
  accountId?: string
  amountCents?: bigint
  status?: PayoutStatus
  pixKey?: string
}

/** Não existe endpoint pra criar um Payout direto (nasce do fan-out do campaign) — semeia direto. */
export function seedPayout(ds: DataSource, overrides: SeedPayoutOverrides = {}): Promise<PayoutEntity> {
  return ds.getRepository(PayoutEntity).save(
    new PayoutEntity({
      campaignId: randomUUID(),
      accountId: overrides.accountId ?? randomUUID(),
      recipientName: 'Ana',
      amountCents: (overrides.amountCents ?? 5000n).toString(),
      channel: { type: 'email', address: 'ana@example.com' },
      status: overrides.status ?? 'pending',
      pixKey: overrides.pixKey,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }),
  )
}

export const claimConfirmedMessage = (payoutId: string, pixKey: string): Message => ({
  Body: serializeClaimConfirmed(new ClaimConfirmed(payoutId, pixKey)),
})

export const claimExpiredMessage = (payoutId: string): Message => ({
  Body: serializeClaimExpired(new ClaimExpired(payoutId)),
})

export const payoutConfirmedMessage = (reference: string, endToEndId = `E-${reference}`): Message => {
  const event: PayoutConfirmed = { reference, endToEndId, confirmedAt: new Date() }
  return { Body: serializePayoutConfirmed(event) }
}
