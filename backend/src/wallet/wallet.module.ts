import { Module } from '@nestjs/common'
import { Wallet } from './service'
import { CashInConsumer } from './cash-in.consumer'
import { SettleModule } from '../settle/settle.module'
import { WalletController } from './wallet.controller'
import {
  ChargeRepository,
  LedgerRepository,
  WalletRepository,
} from './database/repositories'

@Module({
  // Importa a camada física (settle) pela porta outbound `PAYMENT_RAIL`. Wallet
  // (lógico) depende do settle (físico), nunca o contrário. O `CashInConsumer`
  // vive aqui: é o wallet reagindo ao evento que o settle publica.
  imports: [SettleModule],
  controllers: [WalletController],
  providers: [
    Wallet,
    CashInConsumer,
    WalletRepository,
    ChargeRepository,
    LedgerRepository,
  ],
})
export class WalletModule {}
