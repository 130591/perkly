import { Module } from '@nestjs/common'
import { PayoutService } from './service'
import { PayoutRepository } from './database/repository'
import { CreatePayoutConsumer } from './messaging/consumers/create-payouts.consumer'
import { ClaimConfirmedConsumer } from './messaging/consumers/claim-confirmed.consumer'
import { ClaimExpiredConsumer } from './messaging/consumers/claim-expired.consumer'
import { PayoutConfirmedConsumer } from './messaging/consumers/payout-confirmed.consumer'
import { DomainEventPublisher } from './messaging/events'
import { SqsDomainEventPublisher } from './messaging/event-publisher'
import { WalletModule } from '../wallet/wallet.module'
import { SettleModule } from '../settle/settle.module'

/**
 * Consome `payout-batch-requested` (páginas publicadas pelo fan-out do campaign)
 * e cria os payouts. Produz `payout-created` (o Claim assina) via
 * `DomainEventPublisher`/`SqsDomainEventPublisher`.
 *
 * Também consome `claim-confirmed`/`claim-expired` (o Claim é quem produz) e
 * `payout-confirmed` (o settle é quem produz, a partir do webhook
 * `pix-payment-out`) — é o Payout reagindo ao resgate e ao PSP: processa
 * (aciona o PSP via `PAYMENT_RAIL`, porta do settle), libera a reserva ou
 * conclui a liquidação (via `BALANCE_RESERVATION`, porta do wallet). Por isso
 * importa os dois módulos pela API pública deles, nunca pelo concreto.
 *
 * `SqsService` e as filas (producers/consumers, incl. o desligamento do
 * poller em `test`) vêm do registro único e global em
 * `shared/broker/sqs.module.ts` — ver o comentário lá sobre por que registrar
 * `SqsModule` aqui de novo quebraria a entrega de mensagens silenciosamente.
 */
@Module({
  imports: [WalletModule, SettleModule],
  providers: [
    PayoutService,
    PayoutRepository,
    CreatePayoutConsumer,
    ClaimConfirmedConsumer,
    ClaimExpiredConsumer,
    PayoutConfirmedConsumer,
    { provide: DomainEventPublisher, useClass: SqsDomainEventPublisher },
  ],
})
export class PayoutModule {}
