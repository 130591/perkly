import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { ClaimController } from './claim.controller'
import { ClaimService } from './service'
import { ClaimRepository } from './database/repository'
import { CreateClaimConsumer } from './messaging/create-claim.consumer'
import { ClaimExpirationWorker } from './messaging/expiration.worker'
import { ClaimEventPublisher } from './messaging/events'
import { SqsClaimEventPublisher } from './messaging/event-publisher'
import { PAYOUT_CREATED_QUEUE } from '../payout/messaging/queues'
import { CLAIM_CONFIRMED_QUEUE, CLAIM_EXPIRED_QUEUE } from './messaging/queues'
import { ConfigService } from '../config/service'
import { queueUrl } from '../config/sqs.config'

/**
 * Consome `payout-created` (produzida pelo payout) e gera o link de resgate.
 * Publica `ClaimConfirmed`/`ClaimExpired` nas filas reais via
 * `SqsClaimEventPublisher` — consumer e producers na mesma instância de
 * `SqsModule`, igual o payout faz para `payout-batch-requested`/`payout-created`.
 * Em `test` não ligamos o poller nem o worker de expiração; ambos são
 * exercidos por teste dedicado chamando `drain()`/`handle()` direto.
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
          name: PAYOUT_CREATED_QUEUE,
          queueUrl: queueUrl(sqs, PAYOUT_CREATED_QUEUE),
          sqs: client,
        }
        return {
          consumers: config.get('env') === 'test' ? [] : [consumer],
          producers: [
            {
              name: CLAIM_CONFIRMED_QUEUE,
              queueUrl: queueUrl(sqs, CLAIM_CONFIRMED_QUEUE),
              sqs: client,
            },
            {
              name: CLAIM_EXPIRED_QUEUE,
              queueUrl: queueUrl(sqs, CLAIM_EXPIRED_QUEUE),
              sqs: client,
            },
          ],
        }
      },
    }),
  ],
  controllers: [ClaimController],
  providers: [
    ClaimService,
    ClaimRepository,
    CreateClaimConsumer,
    ClaimExpirationWorker,
    { provide: ClaimEventPublisher, useClass: SqsClaimEventPublisher },
  ],
})
export class ClaimModule {}
