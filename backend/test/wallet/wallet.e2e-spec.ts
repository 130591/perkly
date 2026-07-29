import { seedWallet, signAccessToken, useE2eApp } from './e2e'

describe('Wallet (e2e)', () => {
  // Registra os hooks do harness (Postgres + app) no describe — nunca no beforeAll.
  const e2e = useE2eApp()

  it('abre uma cobrança pix e devolve as instruções de pagamento', async () => {
    const { account } = await seedWallet(e2e.ctx.ds)
    const token = signAccessToken(e2e.ctx, { accountId: account.externalId })

    const res = await e2e
      .request()
      .post('/wallet/charge')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'pix', amount: '20000', idempotencyKey: 'k1' })
      .expect(201)

    expect(res.body).toEqual({
      id: expect.any(String),
      status: 'pending',
      amount: '20000',
      pixQrCode: expect.any(String),
      expiresAt: expect.any(String),
    })
  })

  it('deve retornar um erro 404 (Wallet not found)', async () => {
    const token = signAccessToken(e2e.ctx)
    const res = await e2e
      .request()
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
    expect(res.body.message).toBe('Wallet not found')
  })
})
