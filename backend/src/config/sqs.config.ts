import { z } from 'zod'

/**
 * SQS. Defaults apontam para o ElasticMQ do docker-compose (dev local); em
 * produção viram a fila/credencial AWS reais via env. Credenciais dummy porque
 * o ElasticMQ não as valida — mas o `@aws-sdk/client-sqs` exige que existam.
 */
export const sqsConfigSchema = z.object({
  endpoint: z.string().url().default('http://localhost:9324'),
  region: z.string().default('us-east-1'),
  queueUrl: z
    .string()
    .url()
    .default('http://localhost:9324/000000000000/cash-in'),
  accessKeyId: z.string().default('local'),
  secretAccessKey: z.string().default('local'),
})

export type SqsConfig = z.infer<typeof sqsConfigSchema>
