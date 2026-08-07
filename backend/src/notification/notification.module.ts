import { Module } from '@nestjs/common'
import { ConfigService } from '../shared/config/service'
import { NOTIFIER } from './core/notifier'
import { EMAIL_PROVIDER, WHATSAPP_PROVIDER } from './core/providers'
import { SqsNotifier } from './messaging/notifier'
import { EmailNotificationConsumer } from './messaging/email.consumer'
import { WhatsAppNotificationConsumer } from './messaging/whatsapp.consumer'
import { NotificationSentRepository } from './database/notification-sent.repository'
import { SendGridEmailProvider } from './resources/sendgrid/sendgrid-email.provider'
import { TwilioWhatsAppProvider } from './resources/twilio/twilio-whatsapp.provider'

/**
 * Bounded context único pra notificação — RFC 0006. `identity` e `claim`
 * consomem só a porta `Notifier`/`NOTIFIER`; a fila (`notification-email`/
 * `notification-whatsapp`), o router por canal, o render por `reason` e os
 * providers concretos (SendGrid, Twilio WhatsApp) ficam encapsulados aqui.
 *
 * Providers reais desde já (RFC 0006, Decisão 6 — sem stub tipo `Psp`), mas
 * ambos toleram config ausente e lançam erro claro em `send` em vez de
 * quebrar o boot — mesmo padrão do `CelcoinPaymentRail`.
 *
 * `SqsService` e as filas vêm do registro único e global em
 * `shared/broker/sqs.module.ts` — não registrar `SqsModule` aqui de novo.
 */
@Module({
  providers: [
    NotificationSentRepository,
    EmailNotificationConsumer,
    WhatsAppNotificationConsumer,
    { provide: NOTIFIER, useClass: SqsNotifier },
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new SendGridEmailProvider(config.get('sendgrid')),
    },
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new TwilioWhatsAppProvider(config.get('twilio')),
    },
  ],
  exports: [NOTIFIER],
})
export class NotificationModule {}
