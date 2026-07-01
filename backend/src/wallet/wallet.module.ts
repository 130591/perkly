import { Module } from '@nestjs/common'
import { Wallet } from './service'
import { SettleModule } from '../settle/settle.module'
import { WalletController } from './wallet.controller'
import {
  ChargeRepository,
  LedgerRepository,
  WalletRepository,
} from './database/repositories'

@Module({
  imports: [SettleModule],
  controllers: [WalletController],
  providers: [
    Wallet,
    WalletRepository,
    ChargeRepository,
    LedgerRepository,
  ],
  exports: [],
})
export class WalletModule {}
