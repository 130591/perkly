import { NotificationRequest } from '../core/notifier'
import { Channel } from '../../shared/domain/channel'

export function serializeNotificationRequest(
  request: NotificationRequest,
): string {
  return JSON.stringify(request)
}

export class NotificationCodec {
  static parse(body: string): NotificationRequest {
    const raw = JSON.parse(body) as Record<string, unknown>
    const reason = asString(raw, 'reason')
    const idempotencyKey = asString(raw, 'idempotencyKey')
    const recipient = parseChannel(asRecord(raw, 'recipient'))
    const context = asRecord(raw, 'context')

    const parseContext = contextParsers[reason as keyof typeof contextParsers]
    if (!parseContext) 
      throw new Error(`Notification payload has unknown reason "${reason}"`)

    return {
      reason,
      idempotencyKey,
      recipient,
      context: parseContext(context),
    } as NotificationRequest
  }
}

const contextParsers = {
  'claim-link-ready': (ctx: Record<string, unknown>) => ({
    name: asString(ctx, 'name'),
    amountCents: asString(ctx, 'amountCents'),
    link: asString(ctx, 'link'),
    expiresAt: asString(ctx, 'expiresAt'),
  }),
  'tenant-activation': (ctx: Record<string, unknown>) => ({
    name: asString(ctx, 'name'),
    activationLink: asString(ctx, 'activationLink'),
  }),
  'member-invited': (ctx: Record<string, unknown>) => ({
    name: asString(ctx, 'name'),
    inviteLink: asString(ctx, 'inviteLink'),
    tenantName: asString(ctx, 'tenantName'),
  }),
  'password-reset-requested': (ctx: Record<string, unknown>) => ({
    name: asString(ctx, 'name'),
    resetLink: asString(ctx, 'resetLink'),
  }),
} satisfies Record<NotificationRequest['reason'], (ctx: Record<string, unknown>) => unknown>

function parseChannel(raw: Record<string, unknown>): Channel {
  const type = asString(raw, 'type')
  if (type === 'email') {
    return { type: 'email', address: asString(raw, 'address') }
  }
  if (type === 'phone') {
    return { type: 'phone', number: asString(raw, 'number') }
  }
  throw new Error(`NotificationRequest payload has unknown channel type "${type}"`)
}

function asString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key]
  if (typeof value !== 'string') {
    throw new Error(`NotificationRequest payload missing string "${key}"`)
  }
  return value
}

function asRecord(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = raw[key]
  if (typeof value !== 'object' || value === null) {
    throw new Error(`NotificationRequest payload missing object "${key}"`)
  }
  return value as Record<string, unknown>
}