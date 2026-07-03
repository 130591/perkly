import { useE2eApp } from '../wallet/e2e'

describe('Campaign (e2e)', () => {
  const e2e = useE2eApp()

  it('cria uma campanha em draft e devolve id + status', async () => {
    const linksExpireAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString()

    const res = await e2e
      .request()
      .post('/campaign')
      .send({
        name: 'Pesquisa NPS',
        message: 'Obrigado por participar!',
        transferType: 'pix',
        linksExpireAt,
        recipients: [
          {
            name: 'Ana',
            amountCents: '5000',
            channel: { type: 'email', address: 'ana@example.com' },
          },
        ],
      })
      .expect(201)

    expect(res.body).toEqual({
      id: expect.any(String),
      status: 'draft',
    })
  })
})
