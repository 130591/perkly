import { ConfigException } from './config.exception'
import { celcoinConfigSchema } from './celcoin.config'
import { databaseConfigSchema } from './database.config'
import { sqsConfigSchema } from './sqs.config'
import { webhookConfigSchema } from './webhook.config'
import { backofficeConfigSchema } from './backoffice.config'
import { jwtConfigSchema } from './jwt.config'
import { twilioConfigSchema, sendgridConfigSchema } from './notification.config'
import { z } from 'zod'

export const environmentSchema = z.enum(['test', 'development', 'production'])

/** CNPJ da Perkly: 14 dígitos, sem máscara. */
const cnpjSchema = z
  .string()
  .regex(/^\d{14}$/, 'identity (CNPJ) must be 14 digits')

export const sharedConfigSchema = z
  .object({
    env: environmentSchema,
    port: z.coerce.number().int().positive().default(3000),
    identity: cnpjSchema,
    frontendUrl: z.string().url().default('http://localhost:5173'),
    companyName: z.literal('Perkly').default('Perkly'),
    database: databaseConfigSchema,
    // Opcional enquanto a rail é o mock Psp: sem creds no ambiente, o bloco some
    // (não quebra o boot); com qualquer cred setada, é validado por inteiro.
    celcoin: celcoinConfigSchema.optional(),
    // Mesmo padrão do celcoin: sem nenhuma credencial, o bloco some. Os dois
    // podem existir independentemente (RFC 0006, Decisão 6/Provider) — hoje só
    // twilio está setado no .env, sendgrid ainda não.
    twilio: twilioConfigSchema.optional(),
    sendgrid: sendgridConfigSchema.optional(),
    // Sempre presentes: o factory sempre passa o bloco (com props undefined), e
    // cada campo aplica seu default de dev (ElasticMQ local / segredo placeholder).
    sqs: sqsConfigSchema,
    webhook: webhookConfigSchema,
    backoffice: backofficeConfigSchema,
    jwt: jwtConfigSchema,
  })
  // Os secrets abaixo têm default 'dev-secret' para não quebrar o boot em dev/test.
  // Em produção esse default silencioso é uma credencial pública conhecida — falha
  // o boot em vez de subir autenticando/assinando com um segredo previsível.
  .superRefine((config, ctx) => {
    if (config.env !== 'production') return

    const insecureDefaults: Array<{
      path: (string | number)[]
      value: string
    }> = [
      { path: ['jwt', 'secret'], value: config.jwt.secret },
      { path: ['webhook', 'secret'], value: config.webhook.secret },
      { path: ['backoffice', 'token'], value: config.backoffice.token },
    ]
    for (const { path, value } of insecureDefaults) {
      if (value === 'dev-secret') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `${path.join('.')} must not use the 'dev-secret' default in production`,
        })
      }
    }
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

const twilioEnv = () =>
  process.env.TWILIO_ACCOUNT_SID ||
  process.env.TWILIO_AUTH_TOKEN ||
  process.env.TWILIO_WHATSAPP_FROM
    ? {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
        templates: {
          claimLinkReady: process.env.TWILIO_TEMPLATE_CLAIM_LINK_READY,
          tenantActivation: process.env.TWILIO_TEMPLATE_TENANT_ACTIVATION,
          memberInvited: process.env.TWILIO_TEMPLATE_MEMBER_INVITED,
          passwordResetRequested: process.env.TWILIO_TEMPLATE_PASSWORD_RESET,
        },
      }
    : undefined

const sendgridEnv = () =>
  process.env.SENDGRID_API_KEY || process.env.SENDGRID_FROM_EMAIL
    ? {
        apiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.SENDGRID_FROM_EMAIL,
      }
    : undefined

export const sharedConfigFactory = (): SharedConfig => {
  const result = sharedConfigSchema.safeParse({
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    identity: process.env.COMPANY_IDENTITY,
    frontendUrl: process.env.FRONTEND_URL,
    database: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      name: process.env.DB_NAME,
      synchronize: process.env.DB_SYNCHRONIZE,
    },
    celcoin: celcoinEnv(),
    twilio: twilioEnv(),
    sendgrid: sendgridEnv(),
    sqs: {
      endpoint: process.env.SQS_ENDPOINT,
      region: process.env.SQS_REGION,
      accountId: process.env.SQS_ACCOUNT_ID,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    webhook: {
      secret: process.env.WEBHOOK_SECRET,
    },
    backoffice: {
      token: process.env.BACKOFFICE_TOKEN,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      accessTokenTtlSeconds: process.env.JWT_ACCESS_TOKEN_TTL_SECONDS,
    },
  })

  if (result.success) {
    return result.data
  }

  throw new ConfigException(
    `Invalid application configuration: ${result.error.message}`,
  )
}
