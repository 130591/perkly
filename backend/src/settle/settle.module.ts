import { Module } from '@nestjs/common'
import { Psp } from './psp'

@Module({
  imports: [],
  exports: [Psp],
  providers: [Psp],
})
export class SettleModule {}