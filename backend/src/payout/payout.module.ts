import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { PayoutService } from './service'
import { PayoutRepository } from './database/repository'
import { CreatePayoutConsumer } from './messaging/create-payouts.consumer'
import { DomainEventPublisher } from './messaging/events'
import { SqsDomainEventPublisher } from './messaging/event-publisher'
import { PAYOUT_CREATED_QUEUE } from './messaging/queues'
import { PAYOUT_BATCH_QUEUE } from '../campaign/messaging/queues'
import { ConfigService } from '../config/service'
import { queueUrl } from '../config/sqs.config'

/**
 * Consome `payout-batch-requested` (páginas publicadas pelo fan-out do campaign)
 * e cria os payouts. Produz `payout-created` (o Claim assina) via
 * `DomainEventPublisher`/`SqsDomainEventPublisher` — consumer e producer na
 * mesma instância de `SqsModule`, igual settle faz para cash-in (webhook
 * produz, wallet consome). Em `test` não ligamos o poller do consumer.
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
        return {
          consumers: config.get('env') === 'test' ? [] : [consumer],
          producers: [
            {
              name: PAYOUT_CREATED_QUEUE,
              queueUrl: queueUrl(sqs, PAYOUT_CREATED_QUEUE),
              sqs: client,
            },
          ],
        }
      },
    }),
  ],
  providers: [
    PayoutService,
    PayoutRepository,
    CreatePayoutConsumer,
    { provide: DomainEventPublisher, useClass: SqsDomainEventPublisher },
  ],
})
export class PayoutModule {}
