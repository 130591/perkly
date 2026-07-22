import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { CampaignController } from './campaign.controller'
import { CampaignService } from './service'
import { CampaignRepository } from './database/repository'
import { CampaignFanoutWorker } from './messaging/campaign-fanout.worker'
import { PAYOUT_BATCH_QUEUE } from './messaging/queues'
import { WalletModule } from '../wallet/wallet.module'
import { ConfigService } from '../config/service'
import { queueUrl } from '../config/sqs.config'

@Module({
  // Importa o wallet pela sua API pública (`BALANCE_RESERVATION`). Campaign
  // depende do wallet; a comunicação é só pela porta exportada, nunca acesso
  // direto ao service ou aos repositórios de lá.
  //
  // SQS: campaign só PRODUZ `payout-batch-requested` (o `CampaignFanoutWorker`
  // pagina a campanha e publica; o payout consome no módulo dele). Não consome
  // fila nenhuma — o gatilho do fan-out é a varredura do estado da campanha
  // (`status='active' AND fanned_out_at IS NULL`), não um evento (RFC 0002).
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
        return {
          producers: [
            { name: PAYOUT_BATCH_QUEUE, queueUrl: queueUrl(sqs, PAYOUT_BATCH_QUEUE), sqs: client },
          ],
        }
      },
    }),
  ],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository, CampaignFanoutWorker],
})
export class CampaignModule {}
