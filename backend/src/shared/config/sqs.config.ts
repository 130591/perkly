import { z } from 'zod'

/**
 * SQS. Defaults apontam para o ElasticMQ do docker-compose (dev local); em
 * produção viram endpoint/account/credencial AWS reais via env. Credenciais
 * dummy porque o ElasticMQ não as valida — mas o `@aws-sdk/client-sqs` exige que
 * existam.
 *
 * URLs de fila são derivadas de `endpoint`+`accountId`+nome (`queueUrl`), não
 * hardcoded: é o mesmo formato da AWS real
 * (`https://sqs.<region>.amazonaws.com/<accountId>/<fila>`) e do ElasticMQ
 * (`http://localhost:9324/<accountId>/<fila>`). Uma fila nova = só um nome, sem
 * novo env.
 */
export const sqsConfigSchema = z.object({
  endpoint: z.string().url().default('http://localhost:9324'),
  region: z.string().default('us-east-1'),
  accountId: z.string().default('000000000000'),
  accessKeyId: z.string().default('local'),
  secretAccessKey: z.string().default('local'),
})

export type SqsConfig = z.infer<typeof sqsConfigSchema>

/** URL canônica de uma fila a partir do nome lógico — AWS e ElasticMQ iguais. */
export const queueUrl = (sqs: SqsConfig, name: string): string =>
  `${sqs.endpoint}/${sqs.accountId}/${name}`
