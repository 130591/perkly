import { Module } from '@nestjs/common'
import { ConfigService } from '../config/service'
import { Psp } from './psp'
import { CelcoinPaymentRail } from './celcoin/rail'
import { PAYMENT_RAIL } from './payment-rail'
import { CelcoinWebhookController } from './celcoin/webhook.controller'
import { WebhookGuard } from './celcoin/webhook.guard'

/**
 * Contexto da camada FÍSICA de dinheiro (entrada/saída real via PSP). Self-
 * contained: publica sua API pública (`PaymentRail` / token `PAYMENT_RAIL`) e
 * seus eventos (`RailEvent = CashInConfirmed | PayoutConfirmed`), e encapsula
 * o provider (Celcoin, trocável). NÃO conhece o wallet nem o payout — quem
 * depende é quem assina o evento (injeta a rail ou consome a fila).
 *
 * - Outbound: provê `PAYMENT_RAIL` (Celcoin real se houver credencial, senão Psp).
 * - Inbound: recebe os dois webhooks, normaliza e PUBLICA o evento na fila
 *   correspondente. Os consumidores moram no wallet (`CashInConfirmed`) e no
 *   payout (`PayoutConfirmed`).
 *
 * `SqsService` e as filas (`cash-in`/`payout-confirmed`) vêm do registro
 * único e global em `broker/sqs.module.ts` — ver o comentário lá sobre por
 * que registrar `SqsModule` aqui de novo quebraria a entrega de mensagens
 * silenciosamente.
 */
@Module({
  controllers: [CelcoinWebhookController],
  providers: [
    WebhookGuard,
    {
      provide: PAYMENT_RAIL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const celcoin = config.get('celcoin')
        return celcoin ? new CelcoinPaymentRail(celcoin) : new Psp()
      },
    },
  ],
  exports: [PAYMENT_RAIL],
})
export class SettleModule {}
