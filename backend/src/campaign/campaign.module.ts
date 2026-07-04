import { Module } from '@nestjs/common'
import { CampaignController } from './campaign.controller'
import { CampaignService } from './service'
import { CampaignRepository } from './repository'
import { WalletModule } from '../wallet/wallet.module'

@Module({
  // Importa o wallet pela sua API pública (`BALANCE_RESERVATION`). Campaign
  // depende do wallet; a comunicação é só pela porta exportada, nunca acesso
  // direto ao service ou aos repositórios de lá.
  imports: [WalletModule],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository],
})
export class CampaignModule {}
