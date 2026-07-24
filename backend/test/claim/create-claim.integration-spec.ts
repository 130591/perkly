import { randomUUID } from 'node:crypto'
import { useIntegrationApp } from '../wallet/setup'
import { CreateClaimConsumer } from '../../src/claim/messaging/create-claim.consumer'
import { ClaimEntity } from '../../src/claim/database/claim.entity'
import { FUTURE, payoutCreatedMessage, reloadClaimByPayoutId } from './fixtures'

describe('CreateClaimConsumer', () => {
  const ctx = useIntegrationApp()

  describe('dado um evento PayoutCreated', () => {
    it('quando o consumer processa a mensagem, então cria um Claim pendente com os dados do evento', async () => {
      const consumer = ctx.get(CreateClaimConsumer)
      const payoutId = randomUUID()

      await consumer.handle(
        payoutCreatedMessage(payoutId, { recipientName: 'Ana', amountCents: 5000n, linksExpireAt: FUTURE }),
      )

      const claim = await reloadClaimByPayoutId(ctx.ds, payoutId)
      expect(claim.status).toBe('pending')
      expect(claim.contactName).toBe('Ana')
      expect(claim.amountCents).toBe('5000')
      expect(claim.channel).toEqual({ type: 'email', address: 'ana@example.com' })
      expect(claim.expiresAt.toISOString()).toBe(FUTURE.toISOString())
      expect(claim.externalId).toEqual(expect.any(String))
    })
  })

  describe('dado que o mesmo PayoutCreated já foi processado (reentrega do SQS)', () => {
    it('quando o consumer processa a mensagem de novo, então não cria um segundo Claim', async () => {
      const consumer = ctx.get(CreateClaimConsumer)
      const payoutId = randomUUID()
      const message = payoutCreatedMessage(payoutId)

      await consumer.handle(message)
      const firstClaim = await reloadClaimByPayoutId(ctx.ds, payoutId)

      await consumer.handle(message) // reentrega — mesmo payoutId, at-least-once

      const claims = await ctx.ds.getRepository(ClaimEntity).find({ where: { payoutId } })
      expect(claims).toHaveLength(1)
      expect(claims[0].externalId).toBe(firstClaim.externalId)
    })
  })

  describe('dado dois PayoutCreated de payouts diferentes', () => {
    it('quando o consumer processa os dois, então cria um Claim para cada payout', async () => {
      const consumer = ctx.get(CreateClaimConsumer)
      const payoutIdA = randomUUID()
      const payoutIdB = randomUUID()

      await consumer.handle(payoutCreatedMessage(payoutIdA))
      await consumer.handle(payoutCreatedMessage(payoutIdB))

      await expect(reloadClaimByPayoutId(ctx.ds, payoutIdA)).resolves.toBeDefined()
      await expect(reloadClaimByPayoutId(ctx.ds, payoutIdB)).resolves.toBeDefined()
    })
  })
})
