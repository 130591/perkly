import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { PayoutService } from './service'
import { PayoutRepository } from './repository'
import { CreatePayoutConsumer } from './create-payouts.consumer'
import { DomainEventPublisher } from './events'
import { LoggingDomainEventPublisher } from './event-publisher'
import { PAYOUT_BATCH_QUEUE } from '../campaign/messaging/queues'
import { ConfigService } from '../config/service'
import { queueUrl } from '../config/sqs.config'

/**
 * Consome `payout-batch-requested` (páginas publicadas pelo fan-out do campaign)
 * e cria os payouts. Só consumidor da fila — o campaign é quem produz. Publica
 * `PayoutCreated` pela porta `DomainEventPublisher` (impl provisória que loga,
 * até o Claim assinar). Igual settle/campaign: em `test` não ligamos o poller.
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
        const consumer = {
          name: PAYOUT_BATCH_QUEUE,
          queueUrl: queueUrl(sqs, PAYOUT_BATCH_QUEUE),
          sqs: client,
        }
        return { consumers: config.get('env') === 'test' ? [] : [consumer] }
      },
    }),
  ],
  providers: [
    PayoutService,
    PayoutRepository,
    CreatePayoutConsumer,
    { provide: DomainEventPublisher, useClass: LoggingDomainEventPublisher },
  ],
})
export class PayoutModule {}
