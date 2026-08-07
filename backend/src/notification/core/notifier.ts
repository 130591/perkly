import { Channel } from '../../shared/domain/channel'

export type NotificationRequest =
  | {
      reason: 'claim-link-ready'
      idempotencyKey: string
      recipient: Channel
      context: {
        name: string
        amountCents: string
        link: string
        expiresAt: string
      }
    }
  | {
      reason: 'tenant-activation'
      idempotencyKey: string
      recipient: Channel
      context: { name: string; activationLink: string }
    }
  | {
      reason: 'member-invited'
      idempotencyKey: string
      recipient: Channel
      context: { name: string; inviteLink: string; tenantName: string }
    }
  | {
      reason: 'password-reset-requested'
      idempotencyKey: string
      recipient: Channel
      context: { name: string; resetLink: string }
    }

export type NotificationReason = NotificationRequest['reason']

export interface Notifier {
  send(request: NotificationRequest): Promise<void>
}

export const NOTIFIER = Symbol('NOTIFIER')
