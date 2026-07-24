import { Module } from '@nestjs/common'
import { CampaignController } from './campaign.controller'
import { CampaignService } from './service'
import { CampaignRepository } from './database/repository'
import { CampaignFanoutWorker } from './messaging/campaign-fanout.worker'
import { WalletModule } from '../wallet/wallet.module'

@Module({
  // Importa o wallet pela sua API pública (`BALANCE_RESERVATION`). Campaign
  // depende do wallet; a comunicação é só pela porta exportada, nunca acesso
  // direto ao service ou aos repositórios de lá.
  //
  // SQS: campaign só PRODUZ `payout-batch-requested` (o `CampaignFanoutWorker`
  // pagina a campanha e publica; o payout consome no módulo dele). Não consome
  // fila nenhuma — o gatilho do fan-out é a varredura do estado da campanha
  // (`status='active' AND fanned_out_at IS NULL`), não um evento (RFC 0002).
  // `SqsService` vem do registro único e global em `broker/sqs.module.ts`
  // (ver o comentário lá — registrar `SqsModule` aqui de novo quebraria isso).
  imports: [WalletModule],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository, CampaignFanoutWorker],
})
export class CampaignModule {}
