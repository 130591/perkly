import { Module } from '@nestjs/common'
import { Psp } from './psp'
import { PAYMENT_RAIL } from './payment-rail'

@Module({
  imports: [],
  exports: [PAYMENT_RAIL],
  providers: [{ provide: PAYMENT_RAIL, useClass: Psp }],
})
export class SettleModule {}