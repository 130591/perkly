import { useIntegrationApp } from '../wallet/setup'
import { ClaimExpiredConsumer } from '../../src/payout/messaging/consumers/claim-expired.consumer'
import { PayoutEntity } from '../../src/payout/database/payout.entity'
import { Wallet } from '../../src/wallet/service'
import { LedgerRepository } from '../../src/wallet/database/repositories'
import {
  claimExpiredMessage,
  seedFundedReservedAccount,
  seedPayout,
} from './fixtures'

describe('ClaimExpiredConsumer', () => {
  const ctx = useIntegrationApp()

  const reload = (externalId: string) =>
    ctx.ds.getRepository(PayoutEntity).findOneByOrFail({ externalId })

  describe('dado um payout pendente com saldo reservado', () => {
    it('quando o consumer processa ClaimExpired, então marca expired e libera a reserva no wallet', async () => {
      const consumer = ctx.get(ClaimExpiredConsumer)
      const wallet = ctx.get(Wallet)
      const ledgerRepo = ctx.get(LedgerRepository)
      const account = await seedFundedReservedAccount(ctx.ds, wallet, 5000n)
      const payout = await seedPayout(ctx.ds, {
        accountId: account.externalId,
        amountCents: 5000n,
      })

      await consumer.handle(claimExpiredMessage(payout.externalId))

      const reloaded = await reload(payout.externalId)
      expect(reloaded.status).toBe('expired')

      const balances = await ledgerRepo.loadBalances(account.externalId)
      expect(balances.available).toBe(5000n)
      expect(balances.reserved).toBe(0n)
    })
  })

  describe('dado que o mesmo ClaimExpired já foi processado (reentrega do SQS)', () => {
    it('quando o consumer processa de novo, então não libera a reserva duas vezes', async () => {
      const consumer = ctx.get(ClaimExpiredConsumer)
      const wallet = ctx.get(Wallet)
      const ledgerRepo = ctx.get(LedgerRepository)
      const account = await seedFundedReservedAccount(ctx.ds, wallet, 5000n)
      const payout = await seedPayout(ctx.ds, {
        accountId: account.externalId,
        amountCents: 5000n,
      })
      const message = claimExpiredMessage(payout.externalId)

      await consumer.handle(message)
      await consumer.handle(message) // reentrega — já expirado

      const balances = await ledgerRepo.loadBalances(account.externalId)
      expect(balances.available).toBe(5000n)
      expect(balances.reserved).toBe(0n)
    })
  })
})
