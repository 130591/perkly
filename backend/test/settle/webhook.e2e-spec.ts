import { useSqs } from '../wallet/sqs'
import { useE2eApp } from '../wallet/e2e'
import { PAYOUT_CONFIRMED_QUEUE } from '../../src/settle/queues'
import { parsePayoutConfirmed } from '../../src/settle/rail-events.codec'

describe('POST /webhooks/celcoin/pix-payment-out (e2e)', () => {
  // Registrado ANTES de `useE2eApp()`: o webhook publica de verdade via
  // `SqsService`, então precisa do ElasticMQ real de pé antes do Nest compilar
  // o AppModule (beforeAll roda na ordem de registro).
  const sqs = useSqs()
  const e2e = useE2eApp()

  const secretHeader = { 'x-webhook-secret': 'dev-secret' }

  describe('dado um payload novo (entity) confirmado', () => {
    it('quando o webhook recebe, então publica PayoutConfirmed na fila', async () => {
      await e2e
        .request()
        .post('/webhooks/celcoin/pix-payment-out')
        .set(secretHeader)
        .send({
          entity: 'pix-payment-out',
          createTimestamp: '2026-06-16T09:12:00.000+00:00',
          status: 'CONFIRMED',
          body: {
            endToEndId: 'E1393589320230727130301498341234',
            clientCode: 'payout-camp1-recipient42-uuid',
          },
        })
        .expect(200)

      const [body] = await sqs.receive(PAYOUT_CONFIRMED_QUEUE)
      const event = parsePayoutConfirmed(body)
      expect(event.reference).toBe('payout-camp1-recipient42-uuid')
      expect(event.endToEndId).toBe('E1393589320230727130301498341234')
    })
  })

  describe('dado um payload legado (RequestBody) confirmado', () => {
    it('quando o webhook recebe, então publica PayoutConfirmed na fila', async () => {
      await e2e
        .request()
        .post('/webhooks/celcoin/pix-payment-out')
        .set(secretHeader)
        .send({
          RequestBody: {
            TransactionType: 'PAYMENT',
            ClientCode: 'payout-camp2-recipient7-uuid',
            EndToEndId: 'E9999999999999999999999999999999',
            StatusCode: { Description: 'confirmed', StatusId: 2 },
          },
        })
        .expect(200)

      const [body] = await sqs.receive(PAYOUT_CONFIRMED_QUEUE)
      const event = parsePayoutConfirmed(body)
      expect(event.reference).toBe('payout-camp2-recipient7-uuid')
    })
  })

  describe('dado um payload com status de erro (não confirmado)', () => {
    it('quando o webhook recebe, então responde 200 mas não publica nada', async () => {
      await e2e
        .request()
        .post('/webhooks/celcoin/pix-payment-out')
        .set(secretHeader)
        .send({
          entity: 'pix-payment-out',
          createTimestamp: '2026-06-16T09:12:00.000+00:00',
          status: 'ERROR',
          body: {
            endToEndId: 'E-erro',
            clientCode: 'payout-erro-uuid',
          },
        })
        .expect(200)

      expect(await sqs.receive(PAYOUT_CONFIRMED_QUEUE)).toHaveLength(0)
    })
  })

  describe('dado um header de secret inválido', () => {
    it('quando o webhook recebe, então recusa com 401', async () => {
      await e2e
        .request()
        .post('/webhooks/celcoin/pix-payment-out')
        .set({ 'x-webhook-secret': 'wrong' })
        .send({})
        .expect(401)
    })
  })
})
