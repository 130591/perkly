import { ConfigException } from './config.exception'
import { celcoinConfigSchema } from './celcoin.config'
import { databaseConfigSchema } from './database.config'
import { z } from 'zod'

export const environmentSchema = z.enum(['test', 'development', 'production'])

/** CNPJ da Perkly: 14 dígitos, sem máscara. */
const cnpjSchema = z.string().regex(/^\d{14}$/, 'identity (CNPJ) must be 14 digits')

export const sharedConfigSchema = z.object({
  env: environmentSchema,
  port: z.coerce.number().int().positive().default(3000),
  identity: cnpjSchema,
  companyName: z.literal('Perkly').default('Perkly'),
  database: databaseConfigSchema,
  // Opcional enquanto a rail é o mock Psp: sem creds no ambiente, o bloco some
  // (não quebra o boot); com qualquer cred setada, é validado por inteiro.
  celcoin: celcoinConfigSchema.optional(),
})

export type Environment = z.infer<typeof environmentSchema>

export type SharedConfig = z.infer<typeof sharedConfigSchema>

const celcoinEnv = () =>
  process.env.CELCOIN_CLIENT_ID ||
  process.env.CELCOIN_CLIENT_SECRET ||
  process.env.CELCOIN_PIX_KEY
    ? {
        baseUrl: process.env.CELCOIN_BASE_URL,
        clientId: process.env.CELCOIN_CLIENT_ID,
        clientSecret: process.env.CELCOIN_CLIENT_SECRET,
        pixKey: process.env.CELCOIN_PIX_KEY,
      }
    : undefined

export const sharedConfigFactory = (): SharedConfig => {
  const result = sharedConfigSchema.safeParse({
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    identity: process.env.COMPANY_IDENTITY,
    database: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      name: process.env.DB_NAME,
      synchronize: process.env.DB_SYNCHRONIZE,
    },
    celcoin: celcoinEnv(),
  })

  if (result.success) {
    return result.data
  }

  throw new ConfigException(`Invalid application configuration: ${result.error.message}`)
}
