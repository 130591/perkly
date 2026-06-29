import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { initializeTransactionalContext } from 'typeorm-transactional'
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import { AppModule } from '../../src/app.module'
import { Wallet } from '../../src/wallet/service'
import { LedgerRepository } from '../../src/wallet/database/repositories'
import { AccountEntity } from '../../src/wallet/database/entities/account.entity'
import { WalletEntity } from '../../src/wallet/database/entities/wallet.entity'

describe('Wallet (integração com Postgres real)', () => {
  let container: StartedPostgreSqlContainer
  let app: INestApplication
  let ds: DataSource
  let wallet: Wallet
  let ledgerRepo: LedgerRepository

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()

    // AppModule reads these to build the DataSource; synchronize creates the
    // schema in the throwaway container.
    process.env.DB_HOST = container.getHost()
    process.env.DB_PORT = String(container.getPort())
    process.env.DB_USER = container.getUsername()
    process.env.DB_PASSWORD = container.getPassword()
    process.env.DB_NAME = container.getDatabase()
    process.env.DB_SYNCHRONIZE = 'true'

    // Must run before the DataSource is created so @Transactional() can hook it.
    initializeTransactionalContext()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()

    ds = moduleRef.get(DataSource)
    wallet = moduleRef.get(Wallet)
    ledgerRepo = moduleRef.get(LedgerRepository)
  })

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  it('credita o ledger no fluxo addBalance → confirmBalance', async () => {
    // seed: uma conta com carteira zerada
    const account = await ds.getRepository(AccountEntity).save(new AccountEntity({}))
    const seeded = await ds
      .getRepository(WalletEntity)
      .save(new WalletEntity({ account }))

    // cobrança (mock PSP devolve charge id '123') + confirmação
    await wallet.addBalance({
      method: 'pix',
      amount: 20000n,
      accountId: account.externalId,
      idempotencyKey: 'k1',
    })
    await wallet.confirmBalance('123')

    // o razão refletiu o funding
    const balances = await ledgerRepo.loadBalances(account.externalId)
    expect(balances.available).toBe(20000n)
    expect(balances.external).toBe(-20000n)

    // e a coluna de saldo da carteira foi creditada
    const persisted = await ds
      .getRepository(WalletEntity)
      .findOneByOrFail({ id: seeded.id })
    expect(persisted.balance).toBe('20000')
  })
})
