import { Module } from '@nestjs/common'
import { Psp } from './psp'
import { CelcoinPaymentRail } from './client-celcoin'
import { PAYMENT_RAIL } from './payment-rail'
import { ConfigService } from '../wallet/config/service'

@Module({
  imports: [],
  exports: [PAYMENT_RAIL],
  providers: [
    {
      // Usa o client real do Celcoin quando há credencial configurada; sem ela
      // (ex.: dev sem .env preenchido) cai no Psp mock, sem quebrar o boot.
      provide: PAYMENT_RAIL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const celcoin = config.get('celcoin')
        return celcoin ? new CelcoinPaymentRail(celcoin) : new Psp()
      },
    },
  ],
})
export class SettleModule {}
