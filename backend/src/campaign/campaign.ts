export type TransferType = 'pix'
    
export type Channel = 
 | { type: 'email', address: string }
 | { type: 'phone', number: string }
    
export type CampaingStatus = 'draft'  | 'confirmed'  |
 'processing' | 'completed' | 'canceled'

export interface Recipient {
  name: string,
  amountCents: bigint,
  channel: Channel
}

export type CampaignDraft = {
  name: string,
  message: string,
  transferType?: TransferType,
  linksExpireAt: Date,
  recipients: Recipient[]
}

type CampaignProps = {
  name: string,
  message: string,
  transferType: TransferType,
  linksExpireAt: Date,
  status: CampaingStatus,
  recipients: Recipient[]
}


export class Campaign {
  private constructor(
    private readonly props: CampaignProps,
  ) {}

  static draft(command: CampaignDraft, now = new Date()): Campaign {
    this.validateRecipients(command.recipients);
    this.validateExpiration(command.linksExpireAt, now);

    return new Campaign({
      ...command,
      transferType: command.transferType ?? "pix",
      status: "draft",
    })
  }

  private changeStatus(status: CampaingStatus) {
    this.props.status = status;
  }

  private ensureStatus(
    expected: CampaingStatus,
    message: string,
  ) {
    if (this.props.status !== expected) {
      throw new Error(message)
    }
  }

  private ensureNotExpired(now: Date) {
    if (this.props.linksExpireAt <= now) {
      throw new Error("expired")
    }
  }

  private is(status: CampaingStatus) {
    return this.props.status === status
  }

  private static validateRecipients(
    recipients: Recipient[],
  ) {
    if (recipients.length === 0) {
      throw new Error("at least one recipient")
    }

    if (recipients.some(r => r.amountCents <= 0n)) {
      throw new Error("amount must be positive")
    }
  }

  private static validateExpiration(
    expiresAt: Date,
    now: Date,
  ) {
    if (expiresAt <= now) {
      throw new Error("must be in the future")
    }
  }
  
  get name() {
    return this.props.name
  }

  get message() {
    return this.props.message
  }

  get transferType() {
    return this.props.transferType
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
    this.ensureStatus("draft", "cannot confirm")
    this.ensureNotExpired(now)
    this.changeStatus("confirmed")
  }

  startProcessing() {
    this.ensureStatus("confirmed", "cannot start processing")
    this.changeStatus("processing")
  }

  complete() {
    this.ensureStatus("processing", "cannot complete")
    this.changeStatus("completed")
  }

  cancel() {
    if (this.is("processing") || this.is("completed")) {
      throw new Error("cannot cancel")
    }

    this.changeStatus("canceled")
  }

  total(): bigint {
    return this.props.recipients.reduce(
      (sum, recipient) => sum + recipient.amountCents,
      0n,
    )
  }
}
