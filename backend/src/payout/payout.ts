import { Recipient } from '../campaign/domain/batch'

export type PayoutStatus =
  | 'pending'    // aguardando resgate
  | 'claimed'    // usuário informou a chave Pix
  | 'paid'       // Pix enviado com sucesso
  | 'failed'     // tentativa de pagamento falhou
  | 'expired'    // campanha expirou sem resgate

export type PayoutDraft = {
  campaignId: string
  recipient: Recipient
  linksExpireAt: Date
}

type PayoutProps = {
  campaignId: string
  recipient: Recipient
  linksExpireAt: Date
  status: PayoutStatus
  pixKey?: string
}

export class Payout {
  private constructor(
    private readonly props: PayoutProps,
  ) {}

  static draft(command: PayoutDraft, now = new Date()): Payout {
    if (command.linksExpireAt <= now) {
      throw new Error('expired')
    }

    return new Payout({
      ...command,
      status: 'pending',
    })
  }

  static hydrate(props: PayoutProps): Payout {
    return new Payout(props)
  }

  // Leitura do estado para o repositório mapear domínio → entity (espelha o
  // padrão do Campaign: getters no agregado, o repo lê e monta a linha).
  get campaignId() {
    return this.props.campaignId
  }

  get recipient(): Recipient {
    return this.props.recipient
  }

  get linksExpireAt() {
    return this.props.linksExpireAt
  }

  get status() {
    return this.props.status
  }

  get pixKey() {
    return this.props.pixKey
  }

  claim(pixKey: string, now: Date) {
    this.ensureStatus('pending')
    this.ensureNotExpired(now)
    this.props.pixKey = pixKey
    this.props.status = 'claimed'
  }

  markPaid() {
    this.ensureStatus('claimed')
    this.props.status = 'paid'
  }

  markFailed() {
    this.ensureStatus('claimed')
    this.props.status = 'failed'
  }

  expire(now: Date) {
    this.ensureStatus('pending')
    this.ensureNotExpired(now)
    this.props.status = 'expired'
  }

  private ensureStatus(expected: PayoutStatus) {
    if (this.props.status !== expected) {
      throw new Error('invalid status')
    }
  }

  private ensureNotExpired(now: Date) {
    if (this.props.linksExpireAt <= now) {
      throw new Error('expired')
    }
  }
}