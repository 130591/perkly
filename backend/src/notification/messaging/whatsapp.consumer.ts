import { Inject, Injectable, Logger } from '@nestjs/common'
import { Message } from '@aws-sdk/client-sqs'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { WHATSAPP_PROVIDER, WhatsAppProvider } from '../core/providers'
import { WhatsAppRender } from '../core/render/whatsapp'
import { NotificationSentRepository } from '../database/notification-sent.repository'
import { ConfigService } from '../../shared/config/service'
import { NotificationCodec } from './events.codec'
import { NOTIFICATION_WHATSAPP_QUEUE } from './queues'

@Injectable()
export class WhatsAppNotificationConsumer {
  private readonly logger = new Logger(WhatsAppNotificationConsumer.name)

  constructor(
    private readonly sent: NotificationSentRepository,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  @SqsMessageHandler(NOTIFICATION_WHATSAPP_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const request = NotificationCodec.parse(message.Body ?? '')

    if (request.recipient.type !== 'phone') {
      throw new Error(
        `WhatsAppNotificationConsumer received non-phone recipient for reason "${request.reason}"`,
      )
    }

    const alreadySent = await this.sent.wasSent(
      request.reason,
      request.idempotencyKey,
    )
    if (alreadySent) {
      this.logger.log(
        `Skipping duplicate reason=${request.reason} key=${request.idempotencyKey}`,
      )
      return
    }

    const templates = this.config.get('twilio')?.templates ?? {}
    const content = WhatsAppRender.render(request, {
      claimLinkReady: templates.claimLinkReady,
      tenantActivation: templates.tenantActivation,
      memberInvited: templates.memberInvited,
      passwordResetRequested: templates.passwordResetRequested,
    })
    await this.provider.send(request.recipient.number, content)
    await this.sent.markSent(request.reason, request.idempotencyKey, 'whatsapp')
    this.logger.log(
      `Sent whatsapp reason=${request.reason} key=${request.idempotencyKey}`,
    )
  }
}
