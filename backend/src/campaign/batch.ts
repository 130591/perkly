export type Channel =
  | { type: 'email', address: string }
  | { type: 'phone', number: string }

export type BatchStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'completed'
  | 'canceled'

export type Recipient = {
  name: string,
  amountCents: bigint,
  channel: Channel
}

export type BatchDraft = {
  linksExpireAt: Date,
  recipients: Recipient[]
}

type BatchProps = {
  linksExpireAt: Date,
  status: BatchStatus,
  recipients: Recipient[]
}

export class Batch {
  private constructor(private readonly props: BatchProps) {}

  static draft(command: BatchDraft, now = new Date()): Batch {
    this.validateRecipients(command.recipients)
    this.validateExpiration(command.linksExpireAt, now)

    return new Batch({ ...command, status: 'draft' })
  }

  static hydrate(props: BatchProps): Batch {
    return new Batch(props)
  }

  private changeStatus(status: BatchStatus) {
    this.props.status = status
  }

  private ensureStatus(expected: BatchStatus, message: string) {
    if (this.props.status !== expected) {
      throw new Error(message)
    }
  }

  private ensureNotExpired(now: Date) {
    if (this.props.linksExpireAt <= now) {
      throw new Error('expired')
    }
  }

  private static validateRecipients(recipients: Recipient[]) {
    if (recipients.length === 0) {
      throw new Error('at least one recipient')
    }

    if (recipients.some((r) => r.amountCents <= 0n)) {
      throw new Error('amount must be positive')
    }
  }

  private static validateExpiration(expiresAt: Date, now: Date) {
    if (expiresAt <= now) {
      throw new Error('must be in the future')
    }
  }

  get status() {
    return this.props.status
  }

  get recipients(): readonly Recipient[] {
    return this.props.recipients
  }

  get linksExpireAt() {
    return this.props.linksExpireAt
  }

  confirm(now: Date) {
    this.ensureStatus('draft', 'cannot confirm')
    this.ensureNotExpired(now)
    this.changeStatus('confirmed')
  }

  total(): bigint {
    return this.props.recipients.reduce(
      (sum, recipient) => sum + recipient.amountCents,
      0n,
    )
  }
}