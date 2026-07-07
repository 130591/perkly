export type Channel =
  | { type: 'email', address: string }
  | { type: 'phone', number: string }

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
  recipients: Recipient[]
}

export class Batch {
  private constructor(private readonly props: BatchProps) {}

  static create(command: BatchDraft, now = new Date()): Batch {
    this.validateRecipients(command.recipients)
    this.validateExpiration(command.linksExpireAt, now)
    return new Batch(command)
  }

  get recipients(): readonly Recipient[] {
    return this.props.recipients
  }

  get linksExpireAt() {
    return this.props.linksExpireAt
  }

  total(): bigint {
    return this.props.recipients.reduce(
      (sum, recipient) => sum + recipient.amountCents,
      0n,
    )
  }

  private static validateRecipients(recipients: Recipient[]) {
    if (recipients.length === 0) {
      throw new Error('at least one recipient')
    }

    for (const recipient of recipients) {
      if (!recipient.name.trim()) {
        throw new Error('recipient name is required')
      }

      if (recipient.amountCents <= 0n) {
        throw new Error('amount must be positive')
      }

      switch (recipient.channel.type) {
        case 'email':
          if (!recipient.channel.address.trim()) {
            throw new Error('email is required')
          }
          break

        case 'phone':
          if (!recipient.channel.number.trim()) {
            throw new Error('phone is required')
          }
          break
      }
    }
  }

  private static validateExpiration(expiresAt: Date, now: Date) {
    if (expiresAt <= now) {
      throw new Error('must be in the future')
    }
  }
}