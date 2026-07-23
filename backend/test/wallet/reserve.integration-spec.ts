import { Wallet } from '../../src/wallet/service'
import { LedgerRepository } from '../../src/wallet/database/repositories'
import { seedWallet, useIntegrationApp } from './setup'

describe('Wallet — reserve/release (idempotência e concorrência)', () => {
  const ctx = useIntegrationApp()

  // Funda a conta pelo mesmo caminho usado no restante da suíte de integração
  // (addBalance → confirmBalance), sem tocar direto no LedgerRepository.
  async function fundedAccount(amountCents: bigint) {
    const wallet = ctx.get(Wallet)
    const { account } = await seedWallet(ctx.ds)
    const key = `fund:${account.externalId}`

    await wallet.addBalance({
      method: 'pix',
      amount: amountCents,
      accountId: account.externalId,
      idempotencyKey: key,
    })
    await wallet.confirmBalance({
      reference: key,
      endToEndId: `E-${key}`,
      amountCents,
      confirmedAt: new Date(),
    })
    return account
  }

  it('reserve() reentregue com a mesma idempotencyKey não reserva duas vezes', async () => {
    const wallet = ctx.get(Wallet)
    const ledgerRepo = ctx.get(LedgerRepository)
    const account = await fundedAccount(10000n)
    const input = { accountId: account.externalId, amountCents: 4000n, idempotencyKey: 'reserve-1' }

    await wallet.reserve(input)
    await wallet.reserve(input) // reentrega — deve ser no-op

    const balances = await ledgerRepo.loadBalances(account.externalId)
    expect(balances.available).toBe(6000n)
    expect(balances.reserved).toBe(4000n)
  })

  it('release() reentregue com a mesma idempotencyKey não libera duas vezes', async () => {
    const wallet = ctx.get(Wallet)
    const ledgerRepo = ctx.get(LedgerRepository)
    const account = await fundedAccount(10000n)

    await wallet.reserve({ accountId: account.externalId, amountCents: 4000n, idempotencyKey: 'reserve-1' })

    const input = { accountId: account.externalId, amountCents: 4000n, idempotencyKey: 'release-1' }
    await wallet.release(input)
    await wallet.release(input) // reentrega — deve ser no-op

    const balances = await ledgerRepo.loadBalances(account.externalId)
    expect(balances.available).toBe(10000n)
    expect(balances.reserved).toBe(0n)
  })

  it('serializa reserve() concorrentes na mesma conta: um estoura, o outro não deixa overdraft passar', async () => {
    const wallet = ctx.get(Wallet)
    const ledgerRepo = ctx.get(LedgerRepository)
    const account = await fundedAccount(10000n)

    // Duas chamadas concorrentes de 6000 cada — juntas estouram os 10000
    // disponíveis. Sem o `FOR UPDATE` serializando, as duas poderiam ler o
    // mesmo snapshot (10000 disponível) e passar no cheque de saldo.
    const results = await Promise.allSettled([
      wallet.reserve({ accountId: account.externalId, amountCents: 6000n, idempotencyKey: 'concurrent-1' }),
      wallet.reserve({ accountId: account.externalId, amountCents: 6000n, idempotencyKey: 'concurrent-2' }),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)

    const balances = await ledgerRepo.loadBalances(account.externalId)
    expect(balances.available).toBe(4000n)
    expect(balances.reserved).toBe(6000n)
  })
})
