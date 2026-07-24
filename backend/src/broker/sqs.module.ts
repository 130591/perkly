import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { ConfigService } from '../config/service'
import { queueUrl } from '../config/sqs.config'
import { PAYOUT_BATCH_QUEUE } from '../campaign/messaging/queues'
import { PAYOUT_CREATED_QUEUE } from '../payout/messaging/queues'
import { CLAIM_CONFIRMED_QUEUE, CLAIM_EXPIRED_QUEUE } from '../claim/messaging/queues'
import { CASH_IN_QUEUE, PAYOUT_CONFIRMED_QUEUE } from '../settle/queues'

const QUEUES = [
  PAYOUT_BATCH_QUEUE,
  PAYOUT_CREATED_QUEUE,
  CLAIM_CONFIRMED_QUEUE,
  CLAIM_EXPIRED_QUEUE,
  PAYOUT_CONFIRMED_QUEUE,
  CASH_IN_QUEUE,
]

/**
 * Registro único e GLOBAL do `SqsModule` (`@ssut/nestjs-sqs`).
 *
 * `SqsModule.register(Async)` sempre devolve `{ global: true }` — não dá pra
 * desligar isso pela API pública da lib. Registrar em mais de um módulo (como
 * cada domínio fazia antes, um `registerAsync` por módulo) faz cada chamada
 * "competir" pelo mesmo token global `SqsService`: só a última processada
 * sobrevive, e as filas das outras chamadas silenciosamente deixam de existir
 * (`Producer does not exist`) — sem erro de boot, só estoura em runtime.
 *
 * Por isso TODO producer/consumer do app entra aqui, uma vez só. Nenhum
 * módulo de domínio chama `SqsModule.registerAsync` diretamente — eles só
 * injetam `SqsService` (disponível globalmente) ou usam `@SqsMessageHandler`
 * (descoberto app-wide via `@golevelup/nestjs-discovery`, não importa em qual
 * módulo o handler vive).
 */
@Module({
  imports: [
    SqsModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const sqs = config.get('sqs')
        const client = new SQSClient({
          endpoint: sqs.endpoint,
          region: sqs.region,
          credentials: {
            accessKeyId: sqs.accessKeyId,
            secretAccessKey: sqs.secretAccessKey,
          },
        })
        const queue = (name: string) => ({ name, queueUrl: queueUrl(sqs, name), sqs: client })
        const registrations = QUEUES.map(queue)

        return {
          producers: registrations,
          // Em `test` não ligamos os pollers: o harness boota o AppModule
          // inteiro e um poller de fundo puxaria fila (open handles, ruído em
          // CI). Os fluxos são exercidos por teste dedicado (handle()/drain()
          // chamados direto).
          consumers: config.get('env') === 'test' ? [] : registrations,
        }
      },
    }),
  ],
})
export class MessagingModule {}
