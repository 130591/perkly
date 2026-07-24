import { randomUUID } from 'node:crypto'
import { useSqs } from '../wallet/sqs'
import { useIntegrationApp } from '../wallet/setup'
import { CreateClaimConsumer } from '../../src/claim/messaging/create-claim.consumer'
import { ClaimExpirationWorker } from '../../src/claim/messaging/expiration.worker'
import { ClaimEntity } from '../../src/claim/database/claim.entity'
import { parseClaimExpired } from '../../src/claim/messaging/events.codec'
import { CLAIM_EXPIRED_QUEUE } from '../../src/claim/messaging/queues'
import { FUTURE, PAST, payoutCreatedMessage, reloadClaimByPayoutId } from './fixtures'

describe('ClaimExpirationWorker', () => {
  // Registrado ANTES de `useIntegrationApp()`: o endpoint do ElasticMQ real
  // precisa estar em `process.env.SQS_ENDPOINT` antes do Nest compilar o
  // AppModule (beforeAll roda na ordem de registro).
  const sqs = useSqs()
  const ctx = useIntegrationApp()

  const eventsOf = async () =>
    (await sqs.receive(CLAIM_EXPIRED_QUEUE)).map(parseClaimExpired)

  describe('dado um Claim pendente cujo prazo já passou', () => {
    it('quando a varredura roda, então marca expired e publica ClaimExpired', async () => {
      const consumer = ctx.get(CreateClaimConsumer)
      const worker = ctx.get(ClaimExpirationWorker)
      const payoutId = randomUUID()
      await consumer.handle(payoutCreatedMessage(payoutId, { linksExpireAt: PAST }))

      await worker.drain()

      const claim = await reloadClaimByPayoutId(ctx.ds, payoutId)
      expect(claim.status).toBe('expired')
      const events = await eventsOf()
      expect(events).toHaveLength(1)
      expect(events[0].payoutId).toBe(payoutId)
    })
  })

  describe('dado um Claim pendente cujo prazo ainda não passou', () => {
    it('quando a varredura roda, então continua pendente e nada é publicado', async () => {
      const consumer = ctx.get(CreateClaimConsumer)
      const worker = ctx.get(ClaimExpirationWorker)
      const payoutId = randomUUID()
      await consumer.handle(payoutCreatedMessage(payoutId, { linksExpireAt: FUTURE }))

      await worker.drain()

      const claim = await reloadClaimByPayoutId(ctx.ds, payoutId)
      expect(claim.status).toBe('pending')
      expect(await eventsOf()).toHaveLength(0)
    })
  })

  describe('dado um Claim já confirmado (claimed) com o prazo estourado', () => {
    it('quando a varredura roda, então não mexe nele — só pendentes expiram', async () => {
      const consumer = ctx.get(CreateClaimConsumer)
      const worker = ctx.get(ClaimExpirationWorker)
      const payoutId = randomUUID()
      await consumer.handle(payoutCreatedMessage(payoutId, { linksExpireAt: PAST }))
      // Confirmar pelo fluxo real depois do prazo é rejeitado pelo próprio
      // guard de domínio (`Claim.claim()`), então não dá pra chegar num
      // "claimed vencido" por API. Força o estado direto — mesmo truque do
      // `campaign-fanout.integration-spec.ts` pra testar exclusão por status
      // ("ignora campanhas em draft").
      await ctx.ds
        .getRepository(ClaimEntity)
        .update({ payoutId }, { status: 'claimed', pixKey: 'chave-x' })

      await worker.drain()

      const claim = await reloadClaimByPayoutId(ctx.ds, payoutId)
      expect(claim.status).toBe('claimed')
      expect(await eventsOf()).toHaveLength(0)
    })
  })

  describe('dado vários Claims pendentes vencidos', () => {
    it('quando a varredura roda, então expira todos até esvaziar', async () => {
      const consumer = ctx.get(CreateClaimConsumer)
      const worker = ctx.get(ClaimExpirationWorker)
      const payoutIds = [randomUUID(), randomUUID(), randomUUID()]
      for (const payoutId of payoutIds) {
        await consumer.handle(payoutCreatedMessage(payoutId, { linksExpireAt: PAST }))
      }

      await worker.drain()

      for (const payoutId of payoutIds) {
        const claim = await reloadClaimByPayoutId(ctx.ds, payoutId)
        expect(claim.status).toBe('expired')
      }
      const events = await eventsOf()
      expect(events.map((e) => e.payoutId).sort()).toEqual([...payoutIds].sort())
    })
  })
})
