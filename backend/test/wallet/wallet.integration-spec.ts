import { Wallet } from '../../src/wallet/service'
import { LedgerRepository } from '../../src/wallet/database/repositories'
import { WalletEntity } from '../../src/wallet/database/entities/wallet.entity'
import { seedWallet, useIntegrationApp } from './setup'

describe('Wallet', () => {
  const ctx = useIntegrationApp()

  it('credita o ledger no fluxo addBalance → confirmBalance', async () => {
    const wallet = ctx.get(Wallet)
    const ledgerRepo = ctx.get(LedgerRepository)

    // seed: uma conta com carteira zerada
    const { account, wallet: seeded } = await seedWallet(ctx.ds)

    // cobrança + confirmação usando o id que o PSP devolveu
    await wallet.addBalance({
      method: 'pix',
      amount: 20000n,
      accountId: account.externalId,
      idempotencyKey: 'k1',
    })
    await wallet.confirmBalance({
      reference: 'k1',
      endToEndId: 'E-test-20000',
      amountCents: 20000n,
      confirmedAt: new Date(),
    })

    // o razão refletiu o funding
    const balances = await ledgerRepo.loadBalances(account.externalId)
    expect(balances.available).toBe(20000n)
    expect(balances.external).toBe(-20000n)

    // e a coluna de saldo da carteira foi creditada
    const persisted = await ctx.ds
      .getRepository(WalletEntity)
      .findOneByOrFail({ id: seeded.id })
    expect(persisted.balance).toBe('20000')
  })
    
  it('expõe os saldos do ledger no shape serializado', async () => {
    const wallet = ctx.get(Wallet)
    const { account } = await seedWallet(ctx.ds)

    // funda só para ter um número conhecido; o foco aqui é a leitura, não o funding
    await wallet.addBalance({
      method: 'pix',
      amount: 1000n,
      accountId: account.externalId,
      idempotencyKey: 'k1',
    })
    await wallet.confirmBalance({
      reference: 'k1',
      endToEndId: 'E-test-1000',
      amountCents: 1000n,
      confirmedAt: new Date(),
    })

    const balance = await wallet.findBalances(account.externalId)

    // o que só o findBalances faz: centavos como string e total = available + reserved
    expect(balance).toEqual({
      available: '1000',
      reserved: '0',
      total: '1000',
    })
  })
})
