import { useIntegrationApp } from '../wallet/setup'
import { ClaimConfirmedConsumer } from '../../src/payout/messaging/consumers/claim-confirmed.consumer'
import { PayoutEntity } from '../../src/payout/database/payout.entity'
import { Psp } from '../../src/settle/psp'
import { claimConfirmedMessage, seedPayout } from './fixtures'

describe('ClaimConfirmedConsumer', () => {
  const ctx = useIntegrationApp()

  // Sem ElasticMQ/Celcoin real no teste de integração — o `PAYMENT_RAIL` em
  // `test` já resolve pro `Psp` mock (sem credencial configurada); espiona o
  // `pay()` em vez de mockar, pra continuar exercitando o retorno real do mock.
  let paySpy: jest.SpyInstance

  beforeEach(() => {
    paySpy = jest.spyOn(Psp.prototype, 'pay')
  })

  afterEach(() => jest.restoreAllMocks())

  const reload = (externalId: string) =>
    ctx.ds.getRepository(PayoutEntity).findOneByOrFail({ externalId })

  describe('dado um payout pendente', () => {
    it('quando o consumer processa ClaimConfirmed, então guarda a chave Pix, entra em processing e aciona o PSP', async () => {
      const consumer = ctx.get(ClaimConfirmedConsumer)
      const payout = await seedPayout(ctx.ds, { amountCents: 5000n })

      await consumer.handle(claimConfirmedMessage(payout.externalId, 'ana@pix.com'))

      const reloaded = await reload(payout.externalId)
      expect(reloaded.status).toBe('processing')
      expect(reloaded.pixKey).toBe('ana@pix.com')

      expect(paySpy).toHaveBeenCalledTimes(1)
      expect(paySpy.mock.calls[0][0]).toEqual({
        amountCents: 5000n,
        pixKey: 'ana@pix.com',
        reference: payout.externalId,
      })
    })
  })

  describe('dado que o mesmo ClaimConfirmed já foi processado (reentrega do SQS)', () => {
    it('quando o consumer processa de novo, então não aciona o PSP outra vez', async () => {
      const consumer = ctx.get(ClaimConfirmedConsumer)
      const payout = await seedPayout(ctx.ds, { amountCents: 5000n })
      const message = claimConfirmedMessage(payout.externalId, 'ana@pix.com')

      await consumer.handle(message)
      await consumer.handle(message) // reentrega — já está em processing

      expect(paySpy).toHaveBeenCalledTimes(1)
      const reloaded = await reload(payout.externalId)
      expect(reloaded.status).toBe('processing')
    })
  })
})
