import { Channel } from '../campaign/domain/batch'

export type ClaimStatus =
  | 'pending' // link ativo, aguardando o destinatário confirmar
  | 'claimed' // chave Pix recebida; payout pode seguir pra pagamento
  | 'expired' // prazo passou sem confirmação

export type ClaimContact = {
  name: string
  channel: Channel
}

export type ClaimDraft = {
  payoutId: string
  contact: ClaimContact
  amountCents: bigint
  expiresAt: Date
}

type ClaimProps = ClaimDraft & {
  status: ClaimStatus
  pixKey?: string
}

export class Claim {
  private constructor(private readonly props: ClaimProps) {}

  static create(draft: ClaimDraft, now = new Date()): Claim {
    if (draft.expiresAt <= now) throw new Error('expired')
    return new Claim({ ...draft, status: 'pending' })
  }

  static hydrate(props: ClaimProps): Claim {
    return new Claim(props)
  }

  get payoutId() {
    return this.props.payoutId
  }

  get contact() {
    return this.props.contact
  }

  get amountCents() {
    return this.props.amountCents
  }

  get status() {
    return this.props.status
  }

  get pixKey() {
    return this.props.pixKey
  }

  get expiresAt() {
    return this.props.expiresAt
  }

  // "impedir reutilização" é os dois guards juntos: status (não dá pra
  // reivindicar duas vezes) e prazo (não dá pra reivindicar depois do
  // próprio deadline, mesmo que a varredura que marcaria 'expired' ainda
  // não tenha rodado — o agregado não confia só no status pra isso).
  claim(pixKey: string, at = new Date()): void {
    this.ensureStatus('pending')
    if (at >= this.props.expiresAt) throw new Error('expired')
    this.props.pixKey = pixKey
    this.props.status = 'claimed'
  }

  // Espelha Payout.expire(): chamado por uma varredura própria do Claim
  // (mesmo padrão do CampaignFanoutWorker), não por sinal do Payout — os
  // dois já sabem o mesmo expiresAt desde a criação.
  expire(): void {
    this.ensureStatus('pending')
    this.props.status = 'expired'
  }

  private ensureStatus(expected: ClaimStatus): void {
    if (this.props.status !== expected) throw new Error('invalid status')
  }
}
