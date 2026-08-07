import { Injectable } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { Notifier, NotificationRequest } from '../core/notifier'
import { serializeNotificationRequest } from './events.codec'
import { NOTIFICATION_EMAIL_QUEUE, NOTIFICATION_WHATSAPP_QUEUE } from './queues'

@Injectable()
export class SqsNotifier implements Notifier {
  constructor(private readonly sqs: SqsService) {}

  async send(request: NotificationRequest): Promise<void> {
    const body = serializeNotificationRequest(request)

    switch (request.recipient.type) {
      case 'email':
        await this.sqs.send(NOTIFICATION_EMAIL_QUEUE, {
          id: request.idempotencyKey,
          body,
        })
        return
      case 'phone':
        await this.sqs.send(NOTIFICATION_WHATSAPP_QUEUE, {
          id: request.idempotencyKey,
          body,
        })
        return
    }
  }
}
