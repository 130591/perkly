import { seedWallet, useE2eApp } from './e2e'
import { randomUUID } from 'crypto'
    
describe('Wallet (e2e)', () => {
  // Registra os hooks do harness (Postgres + app) no describe — nunca no beforeAll.
  const e2e = useE2eApp()

  it('abre uma cobrança pix e devolve as instruções de pagamento', async () => {
    const { account } = await seedWallet(e2e.ctx.ds)

    const res = await e2e
      .request()
      .post(`/wallets/${account.externalId}/charges`)
      .send({ method: 'pix', amount: '20000', idempotencyKey: 'k1' })
      .expect(201)

    expect(res.body).toEqual({
      id: '123',
      status: 'PENDING',
      amount: '20000',
      pixQrCode: 'kdmomokdmskomsdkmosmdkmosmdk',
      expiresAt: expect.any(String),
    })
  })

  it('deve retornar um erro 404 (Wallet not found)', async () => {
    const res = await e2e
    .request()
    .get(`/wallets/${randomUUID()}/balances`)
    .expect(404)
     expect(res.body.message).toBe('Wallet not found')
  })
})
