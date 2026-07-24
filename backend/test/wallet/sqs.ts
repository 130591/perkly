import { resolve } from 'node:path'
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'

const ELASTICMQ_CONF = resolve(__dirname, '../../elasticmq.conf')
const SQS_PORT = 9324

export type SqsContext = {
  endpoint: string
  accountId: string
  queueUrl: (name: string) => string
  /** Consome (e apaga) as mensagens disponíveis numa fila — pra asserção nos testes. */
  receive: (queueName: string) => Promise<string[]>
}

/**
 * Sobe um ElasticMQ real (mesma imagem/config do docker-compose) via
 * Testcontainers, em vez de mockar `SqsService.send` — dá garantia de que o
 * wire format, a URL da fila e as credenciais funcionam fim a fim, não só que
 * o método foi chamado.
 *
 * Registre ANTES de `useIntegrationApp()`/`useE2eApp()` no describe: os
 * `beforeAll` do Jest rodam na ordem de registro, e `SQS_ENDPOINT` precisa
 * estar setado antes do Nest compilar o AppModule.
 */
export function useSqs(): SqsContext {
  const ctx = {} as SqsContext
  let container: StartedTestContainer

  beforeAll(async () => {
    container = await new GenericContainer('softwaremill/elasticmq-native')
      .withExposedPorts(SQS_PORT)
      .withCopyFilesToContainer([{ source: ELASTICMQ_CONF, target: '/opt/elasticmq.conf' }])
      .withWaitStrategy(Wait.forListeningPorts())
      .start()

    ctx.endpoint = `http://${container.getHost()}:${container.getMappedPort(SQS_PORT)}`
    ctx.accountId = '000000000000'
    ctx.queueUrl = (name) => `${ctx.endpoint}/${ctx.accountId}/${name}`
    ctx.receive = async (queueName) => {
      const client = new SQSClient({
        endpoint: ctx.endpoint,
        region: 'us-east-1',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      })
      const queueUrl = ctx.queueUrl(queueName)
      const result = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
        }),
      )
      const messages = result.Messages ?? []
      // Apaga o que leu: cada `receive()` reflete só o que chegou desde a
      // última chamada, do jeito que um consumer de verdade drenaria a fila.
      await Promise.all(
        messages.map((message) =>
          client.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle!,
            }),
          ),
        ),
      )
      return messages.map((message) => message.Body!)
    }

    process.env.SQS_ENDPOINT = ctx.endpoint
    process.env.SQS_ACCOUNT_ID = ctx.accountId
  }, 120_000)

  afterAll(async () => {
    await container?.stop()
  })

  return ctx
}
