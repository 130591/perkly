import { Inject, Injectable, Logger } from '@nestjs/common'
import { Message } from '@aws-sdk/client-sqs'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { EMAIL_PROVIDER, EmailProvider } from '../core/providers'
import { EmailRender } from '../core/render/email'
import { NotificationSentRepository } from '../database/notification-sent.repository'
import { NotificationCodec } from './events.codec'
import { NOTIFICATION_EMAIL_QUEUE } from './queues'

@Injectable()
export class EmailNotificationConsumer {
  private readonly logger = new Logger(EmailNotificationConsumer.name)

  constructor(
    private readonly sent: NotificationSentRepository,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  @SqsMessageHandler(NOTIFICATION_EMAIL_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const request = NotificationCodec.parse(message.Body ?? '')

    if (request.recipient.type !== 'email') {
      throw new Error(
        `EmailNotificationConsumer received non-email recipient for reason "${request.reason}"`,
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

    const content = EmailRender.render(request)
    await this.provider.send(request.recipient.address, content)
    await this.sent.markSent(request.reason, request.idempotencyKey, 'email')
    this.logger.log(
      `Sent email reason=${request.reason} key=${request.idempotencyKey}`,
    )
  }
}
