import { Module } from '@nestjs/common'
import { Wallet } from './service'

@Module({
  imports: [],
  controllers: [],
  providers: [Wallet],
})
export class WalletModule {}