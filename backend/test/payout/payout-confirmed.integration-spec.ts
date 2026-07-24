import { useIntegrationApp } from '../wallet/setup'
import { PayoutConfirmedConsumer } from '../../src/payout/messaging/consumers/payout-confirmed.consumer'
import { PayoutEntity } from '../../src/payout/database/payout.entity'
import { Wallet } from '../../src/wallet/service'
import { LedgerRepository } from '../../src/wallet/database/repositories'
import { payoutConfirmedMessage, seedFundedReservedAccount, seedPayout } from './fixtures'

describe('PayoutConfirmedConsumer', () => {
  const ctx = useIntegrationApp()

  const reload = (externalId: string) =>
    ctx.ds.getRepository(PayoutEntity).findOneByOrFail({ externalId })

  describe('dado um payout em processamento com saldo reservado', () => {
    it('quando o consumer processa PayoutConfirmed, então marca paid e consome a reserva no wallet', async () => {
      const consumer = ctx.get(PayoutConfirmedConsumer)
      const wallet = ctx.get(Wallet)
      const ledgerRepo = ctx.get(LedgerRepository)
      const account = await seedFundedReservedAccount(ctx.ds, wallet, 5000n)
      const payout = await seedPayout(ctx.ds, {
        accountId: account.externalId,
        amountCents: 5000n,
        status: 'processing',
        pixKey: 'ana@pix.com',
      })

      await consumer.handle(payoutConfirmedMessage(payout.externalId))

      const reloaded = await reload(payout.externalId)
      expect(reloaded.status).toBe('paid')
      expect(reloaded.paidAt).not.toBeNull()

      const balances = await ledgerRepo.loadBalances(account.externalId)
      expect(balances.reserved).toBe(0n)
      expect(balances.available).toBe(0n)
      expect(balances.external).toBe(0n) // -5000 (fund) + 5000 (settle) — round-trip fechado
    })
  })

  describe('dado que o mesmo PayoutConfirmed já foi processado (reentrega do webhook)', () => {
    it('quando o consumer processa de novo, então não consome a reserva duas vezes', async () => {
      const consumer = ctx.get(PayoutConfirmedConsumer)
      const wallet = ctx.get(Wallet)
      const ledgerRepo = ctx.get(LedgerRepository)
      const account = await seedFundedReservedAccount(ctx.ds, wallet, 5000n)
      const payout = await seedPayout(ctx.ds, {
        accountId: account.externalId,
        amountCents: 5000n,
        status: 'processing',
        pixKey: 'ana@pix.com',
      })
      const message = payoutConfirmedMessage(payout.externalId)

      await consumer.handle(message)
      await consumer.handle(message) // reentrega — já pago

      const balances = await ledgerRepo.loadBalances(account.externalId)
      expect(balances.reserved).toBe(0n)
      expect(balances.external).toBe(0n)
    })
  })
})
