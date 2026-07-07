import { Batch, BatchDraft } from './batch'

export type TransferType = 'pix'

// Estados existem no vocabulário (auditoria/futuro confirm), mas na criação o
// batch nasce e permanece `draft`. As transições (confirm/cancel) e os estados
// derivados dos payouts (processing/completed) ficam para a fatia de confirmação.
export type CampaignStatus =
  | 'draft'
  | 'active'
  | 'closed'
  | 'canceled'

export type CampaignDraft = {
  accountId: string,
  name: string,
  message: string,
  transferType?: TransferType,
  batches: BatchDraft[]
}

type CampaignProps = {
  accountId: string,
  name: string,
  message: string,
  transferType: TransferType,
  status: CampaignStatus,
  batches: Batch[]
}


export class Campaign {
  private constructor(private readonly props: CampaignProps) {}

  static draft(command: CampaignDraft, now = new Date()): Campaign {
    const batches = command.batches.map((batch) => Batch.create(batch, now))

    return new Campaign({
      accountId: command.accountId,
      name: command.name,
      message: command.message,
      transferType: command.transferType ?? 'pix',
      status: 'draft',
      batches,
    })
  }

  static hydrate(props: CampaignProps): Campaign {
    return new Campaign(props)
  }

  private changeStatus(status: CampaignStatus) {
    this.props.status = status
  }

  private ensureStatus(expected: CampaignStatus, message: string) {
    if (this.props.status !== expected) {
      throw new Error(message)
    }
  }

  get accountId() {
    return this.props.accountId
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

  get batches(): readonly Batch[] {
    return this.props.batches
  }

  activate(now: Date) {
    this.ensureStatus('draft', 'campaign is not draft')
    for (const batch of this.props.batches) {
      batch.ensureCanActivate(now)
    }
    this.changeStatus('active')
  }

  total(): bigint {
    return this.props.batches.reduce((sum, batch) => sum + batch.total(), 0n)
  }
}
