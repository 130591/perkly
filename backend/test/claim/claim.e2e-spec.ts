import { randomUUID } from 'crypto'
import { useSqs } from '../wallet/sqs'
import { useE2eApp } from '../wallet/e2e'
import { CreateClaimConsumer } from '../../src/claim/messaging/create-claim.consumer'
import { FUTURE, PAST, payoutCreatedMessage, reloadClaimByPayoutId } from './fixtures'

describe('Claim (e2e)', () => {
  // Registrado ANTES de `useE2eApp()`: confirmar/expirar publica de verdade
  // via `SqsClaimEventPublisher`, então precisa do ElasticMQ real de pé antes
  // do Nest compilar o AppModule (beforeAll roda na ordem de registro). Este
  // spec não inspeciona a fila, só precisa que publicar não estoure.
  useSqs()
  // Registra os hooks do harness (Postgres + app) no describe — nunca no beforeAll.
  const e2e = useE2eApp()

  // Não existe endpoint pra criar um Claim direto — ele nasce reagindo a
  // `PayoutCreated` (SQS). Pra preparar o cenário, entregamos o evento pro
  // consumer de verdade (mesma técnica do `campaign.e2e-spec.ts` ao semear
  // saldo via ledger direto) e descobrimos o link gerado consultando a
  // tabela — o teste em si (abrir/confirmar) roda 100% pela API.
  async function createClaim(linksExpireAt = FUTURE, amountCents = 5000n) {
    const consumer = e2e.ctx.get(CreateClaimConsumer)
    const payoutId = randomUUID()
    await consumer.handle(payoutCreatedMessage(payoutId, { linksExpireAt, amountCents }))
    const entity = await reloadClaimByPayoutId(e2e.ctx.ds, payoutId)
    return entity.externalId
  }

  describe('dado um claim pendente', () => {
    it('quando abre o link, então devolve status, valor e prazo', async () => {
      const claimId = await createClaim(FUTURE, 5000n)

      const res = await e2e.request().get(`/claims/${claimId}`).expect(200)

      expect(res.body).toEqual({
        status: 'pending',
        amount: '5000',
        expiresAt: expect.any(String),
      })
    })
  })

  describe('dado um claimId que não existe', () => {
    it('quando abre o link, então devolve 404', async () => {
      const res = await e2e.request().get(`/claims/${randomUUID()}`).expect(404)

      expect(res.body.message).toBe('Claim not found')
    })
  })

  describe('dado um claim pendente e dentro do prazo', () => {
    it('quando confirma com a chave pix, então marca claimed e o link reflete a mudança', async () => {
      const claimId = await createClaim(FUTURE, 5000n)

      const confirmRes = await e2e
        .request()
        .post(`/claims/${claimId}/pix-key`)
        .send({ pixKey: 'ana@pix.com' })
        .expect(201)

      expect(confirmRes.body).toEqual({ status: 'claimed', amount: '5000' })

      const readRes = await e2e.request().get(`/claims/${claimId}`).expect(200)
      expect(readRes.body.status).toBe('claimed')
    })
  })

  describe('dado um claim já confirmado', () => {
    it('quando tenta confirmar de novo, então recusa e não sobrescreve a chave pix', async () => {
      const claimId = await createClaim(FUTURE, 5000n)
      await e2e
        .request()
        .post(`/claims/${claimId}/pix-key`)
        .send({ pixKey: 'primeira@pix.com' })
        .expect(201)

      await e2e
        .request()
        .post(`/claims/${claimId}/pix-key`)
        .send({ pixKey: 'segunda@pix.com' })
        .expect(500)

      const readRes = await e2e.request().get(`/claims/${claimId}`).expect(200)
      expect(readRes.body.status).toBe('claimed')
    })
  })

  describe('dado um claim cujo prazo já passou', () => {
    it('quando tenta confirmar, então recusa e o claim continua pendente', async () => {
      const claimId = await createClaim(PAST, 5000n)

      await e2e
        .request()
        .post(`/claims/${claimId}/pix-key`)
        .send({ pixKey: 'tarde@pix.com' })
        .expect(500)

      const readRes = await e2e.request().get(`/claims/${claimId}`).expect(200)
      expect(readRes.body.status).toBe('pending')
    })
  })

  describe('dado um claim pendente e dois cliques concorrentes no mesmo link', () => {
    it('quando os dois tentam confirmar ao mesmo tempo, então só um vence', async () => {
      const claimId = await createClaim(FUTURE, 5000n)

      const results = await Promise.allSettled([
        e2e.request().post(`/claims/${claimId}/pix-key`).send({ pixKey: 'a@pix.com' }),
        e2e.request().post(`/claims/${claimId}/pix-key`).send({ pixKey: 'b@pix.com' }),
      ])

      const statuses = results.map((r) =>
        r.status === 'fulfilled' ? r.value.status : 'rejected',
      )
      expect(statuses.filter((s) => s === 201)).toHaveLength(1)
      expect(statuses.filter((s) => s === 500)).toHaveLength(1)

      const readRes = await e2e.request().get(`/claims/${claimId}`).expect(200)
      expect(readRes.body.status).toBe('claimed')
    })
  })
})
