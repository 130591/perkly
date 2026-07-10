import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { ConfigService } from '../config/service'
import { queueUrl } from '../config/sqs.config'
import { Psp } from './psp'
import { CelcoinPaymentRail } from './celcoin/rail'
import { PAYMENT_RAIL } from './payment-rail'
import { CelcoinWebhookController } from './celcoin/webhook.controller'
import { WebhookGuard } from './celcoin/webhook.guard'
import { CASH_IN_QUEUE } from './queues'

/**
 * Contexto da camada FÍSICA de dinheiro (entrada/saída real via PSP). Self-
 * contained: publica sua API pública (`PaymentRail` / token `PAYMENT_RAIL`) e
 * seus eventos (`CashInConfirmed`), e encapsula o provider (Celcoin, trocável).
 * NÃO conhece o wallet — quem depende é o wallet (injeta a rail, assina o evento).
 *
 * - Outbound: provê `PAYMENT_RAIL` (Celcoin real se houver credencial, senão Psp).
 * - Inbound: recebe o webhook, normaliza e PUBLICA `CashInConfirmed` na fila. O
 *   consumidor mora no wallet (o assinante); aqui só registramos o transporte SQS
 *   — o poller casa com o handler decorado lá via descoberta app-wide.
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
        const url = queueUrl(sqs, CASH_IN_QUEUE)
        return {
          producers: [{ name: CASH_IN_QUEUE, queueUrl: url, sqs: client }],
          // Em `test` NÃO ligamos o polling: o harness boota o AppModule inteiro e
          // um poller de fundo puxaria fila (open handles, ruído em CI). O fluxo é
          // exercido por teste dedicado.
          consumers:
            config.get('env') === 'test'
              ? []
              : [{ name: CASH_IN_QUEUE, queueUrl: url, sqs: client }],
        }
      },
    }),
  ],
  controllers: [CelcoinWebhookController],
  providers: [
    WebhookGuard,
    {
      provide: PAYMENT_RAIL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const celcoin = config.get('celcoin')
        return celcoin ? new CelcoinPaymentRail(celcoin) : new Psp()
      },
    },
  ],
  exports: [PAYMENT_RAIL],
})
export class SettleModule {}
