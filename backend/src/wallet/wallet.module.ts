import { Module } from '@nestjs/common'
import { Wallet } from './service'
import { SettleModule } from '../settle/settle.module'

@Module({
  imports: [SettleModule],
  controllers: [],
  providers: [Wallet],
})
export class WalletModule {}