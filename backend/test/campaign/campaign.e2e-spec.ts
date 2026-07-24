import { randomUUID } from 'crypto'
import { useE2eApp, seedWallet } from '../wallet/e2e'
import { LedgerRepository } from '../../src/wallet/database/repositories'
import { Ledger } from '../../src/wallet/domain/ledger'

const futureIso = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

const oneRecipientBatch = () => ({
  linksExpireAt: futureIso(),
  recipients: [
    {
      name: 'Ana',
      amountCents: '5000',
      channel: { type: 'email', address: 'ana@example.com' },
    },
  ],
})

describe('Campaign (e2e)', () => {
  // Registra os hooks do harness (Postgres + app) no describe — nunca no beforeAll.
  const e2e = useE2eApp()

  it('cria uma campanha em draft e devolve id + status', async () => {
    const res = await e2e
      .request()
      .post('/campaign')
      .send({
        accountId: randomUUID(),
        name: 'Pesquisa NPS',
        message: 'Obrigado por participar!',
        transferType: 'pix',
        batches: [oneRecipientBatch()],
      })
      .expect(201)

    expect(res.body).toEqual({
      id: expect.any(String),
      status: 'draft',
    })
  })

  it('confirma a campanha: reserva o saldo no wallet e marca confirmed', async () => {
    const { account, wallet } = await seedWallet(e2e.ctx.ds)

    // Semeia saldo disponível: injeta uma transação de fund direto no ledger.
    const ledgerRepo = e2e.ctx.get(LedgerRepository)
    const ledger = Ledger.hydrate(await ledgerRepo.loadBalances(account.externalId))
    await ledgerRepo.append(wallet.id, ledger.fund(10000n))

    const created = await e2e
      .request()
      .post('/campaign')
      .send({
        accountId: account.externalId,
        name: 'Pesquisa NPS',
        message: 'Obrigado por participar!',
        transferType: 'pix',
        batches: [oneRecipientBatch()], // total 5000
      })
      .expect(201)

    const campaignId = created.body.id

    const confirmed = await e2e
      .request()
      .post(`/campaign/${campaignId}/confirm`)
      .expect(201)

    expect(confirmed.body).toEqual({ id: campaignId, status: 'active' })

    // O saldo saiu de available para reserved.
    const balances = await e2e
      .request()
      .get(`/wallet/${account.externalId}/balance`)
      .expect(200)

    expect(balances.body).toEqual({
      available: '5000',
      reserved: '5000',
      total: '10000',
    })
  })

  it('recusa confirmar com saldo insuficiente (não deixa reserva pela metade)', async () => {
    const { account } = await seedWallet(e2e.ctx.ds) // carteira zerada

    const created = await e2e
      .request()
      .post('/campaign')
      .send({
        accountId: account.externalId,
        name: 'Pesquisa NPS',
        message: 'Obrigado por participar!',
        transferType: 'pix',
        batches: [oneRecipientBatch()], // total 5000, sem saldo
      })
      .expect(201)

    await e2e.request().post(`/campaign/${created.body.id}/confirm`).expect(500)

    // Continua draft: a transação foi revertida por inteiro.
    const balances = await e2e
      .request()
      .get(`/wallet/${account.externalId}/balance`)
      .expect(200)

    expect(balances.body).toEqual({
      available: '0',
      reserved: '0',
      total: '0',
    })
  })
})
