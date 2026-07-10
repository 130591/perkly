import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { CampaignController } from './campaign.controller'
import { CampaignService } from './service'
import { CampaignRepository } from './repository'
import { CampaignFanoutConsumer } from './campaign-fanout.consumer'
import { CAMPAIGN_ACTIVATED_QUEUE, PAYOUT_BATCH_QUEUE } from './queues'
import { WalletModule } from '../wallet/wallet.module'
import { ConfigService } from '../config/service'
import { queueUrl } from '../config/sqs.config'

@Module({
  // Importa o wallet pela sua API pública (`BALANCE_RESERVATION`). Campaign
  // depende do wallet; a comunicação é só pela porta exportada, nunca acesso
  // direto ao service ou aos repositórios de lá.
  //
  // SQS: o `confirm` publica `campaign-activated` (magro); o
  // `CampaignFanoutConsumer` assina essa fila e publica `payout-batch-requested`
  // (páginas). Campaign é produtor das duas e consumidor da primeira — o payout
  // consome a segunda no módulo dele. Igual settle: em `test` não ligamos o poller.
  imports: [
    WalletModule,
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
        const queue = (name: string) => ({
          name,
          queueUrl: queueUrl(sqs, name),
          sqs: client,
        })
        return {
          producers: [queue(CAMPAIGN_ACTIVATED_QUEUE), queue(PAYOUT_BATCH_QUEUE)],
          consumers:
            config.get('env') === 'test' ? [] : [queue(CAMPAIGN_ACTIVATED_QUEUE)],
        }
      },
    }),
  ],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository, CampaignFanoutConsumer],
})
export class CampaignModule {}
