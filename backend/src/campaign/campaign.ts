import { Batch, BatchStatus, BatchDraft } from './batch'

export type TransferType = 'pix'

// Estados existem no vocabulário (auditoria/futuro confirm), mas na criação o
// batch nasce e permanece `draft`. As transições (confirm/cancel) e os estados
// derivados dos payouts (processing/completed) ficam para a fatia de confirmação.
export type CampaignStatus = BatchStatus

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
    const batches = command.batches.map((batch) => Batch.draft(batch, now))

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

  // Guarda o próprio estado e delega a transição a cada batch (Tell, Don't Ask):
  // a validação de expiração vive no Batch; o Campaign orquestra e faz o rollup.
  // A reserva de saldo é do service (porta do wallet), não do domínio.
  confirm(now: Date) {
    this.ensureStatus('draft', 'cannot confirm')
    this.props.batches.forEach((batch) => batch.confirm(now))
    this.changeStatus('confirmed')
  }

  total(): bigint {
    return this.props.batches.reduce((sum, batch) => sum + batch.total(), 0n)
  }
}
