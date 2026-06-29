import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { initializeTransactionalContext } from 'typeorm-transactional'
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import { AppModule } from '../../src/app.module'
import { AccountEntity } from '../../src/wallet/database/entities/account.entity'
import { WalletEntity } from '../../src/wallet/database/entities/wallet.entity'

/**
 * Tudo o que um spec de integração precisa. Os campos são preenchidos no
 * `beforeAll` que o `useIntegrationApp` registra — leia-os dentro dos `it`,
 * nunca no corpo do `describe`.
 */
export type IntegrationContext = {
  app: INestApplication
  ds: DataSource
  /** Resolve um provider pelo token (ex.: `ctx.get(Wallet)`). */
  get: INestApplication['get']
  /** Servidor HTTP cru para `request(ctx.http())` do supertest. */
  http: () => ReturnType<INestApplication['getHttpServer']>
}

export function useIntegrationApp(): IntegrationContext {
  const ctx = {} as IntegrationContext
  let container: StartedPostgreSqlContainer

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()

    process.env.DB_HOST = container.getHost()
    process.env.DB_PORT = String(container.getPort())
    process.env.DB_USER = container.getUsername()
    process.env.DB_PASSWORD = container.getPassword()
    process.env.DB_NAME = container.getDatabase()
    process.env.DB_SYNCHRONIZE = 'true'

    // Precisa rodar antes do DataSource existir para o @Transactional() enganchar.
    initializeTransactionalContext()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    const app = moduleRef.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    )
    await app.init()

    ctx.app = app
    ctx.ds = moduleRef.get(DataSource)
    ctx.get = app.get.bind(app)
    ctx.http = () => app.getHttpServer()
  }, 120_000)

  // Container é um só para o describe inteiro; zera as tabelas entre os testes
  // para cada `it` partir de um banco limpo (sem isso, charges/idempotência de
  // um teste vazam para o próximo).
  afterEach(async () => {
    const tables = ctx.ds.entityMetadatas
      .map((m) => `"${m.tableName}"`)
      .join(', ')
    await ctx.ds.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
  })

  afterAll(async () => {
    await ctx.app?.close()
    await container?.stop()
  })

  return ctx
}

/** Semeia uma conta com carteira zerada e devolve ambas. */
export async function seedWallet(ds: DataSource) {
  const account = await ds.getRepository(AccountEntity).save(new AccountEntity({}))
  const wallet = await ds
    .getRepository(WalletEntity)
    .save(new WalletEntity({ account }))
  return { account, wallet }
}
