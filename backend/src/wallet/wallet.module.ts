import { Module } from '@nestjs/common'
import { Wallet } from './service'
import { Config } from './config'
import { SettleModule } from '../settle/settle.module'
import {
  ChargeRepository,
  LedgerRepository,
  WalletRepository,
} from './database/repositories'

@Module({
  imports: [SettleModule],
  controllers: [],
  providers: [
    Wallet,
    Config,
    WalletRepository,
    ChargeRepository,
    LedgerRepository,
  ],
  exports: [Wallet],
})
export class WalletModule {}
