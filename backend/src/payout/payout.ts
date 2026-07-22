import { Recipient } from '../campaign/domain/batch'

export type PayoutStatus =
  | 'pending'     // aguardando resgate
  | 'processing'  // resgate confirmado (Claim); pagamento em andamento
  | 'paid'        // Pix enviado com sucesso
  | 'failed'      // tentativa de pagamento falhou
  | 'expired'     // prazo do resgate estourou sem confirmação; reserva a liberar no wallet

export type PayoutDraft = {
  campaignId: string
  accountId: string
  recipient: Recipient
  linksExpireAt: Date
}

type PayoutProps = {
  campaignId: string
  accountId: string
  recipient: Recipient
  linksExpireAt: Date
  status: PayoutStatus
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

  get accountId() {
    return this.props.accountId
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

  // Chamado quando o Claim confirma o resgate (recebeu a chave Pix) e publica
  // o evento correspondente. O Payout não guarda a chave — só reage ao fato.
  startProcessing() {
    this.ensureStatus('pending')
    this.props.status = 'processing'
  }

  markPaid() {
    this.ensureStatus('processing')
    this.props.status = 'paid'
  }

  markFailed() {
    this.ensureStatus('processing')
    this.props.status = 'failed'
  }

  // Chamado quando o Claim avisa que o prazo estourou sem resgate — o Claim é
  // dono do prazo, o Payout só reage liberando a reserva (fora deste método).
  expire() {
    this.ensureStatus('pending')
    this.props.status = 'expired'
  }

  private ensureStatus(expected: PayoutStatus) {
    if (this.props.status !== expected) {
      throw new Error('invalid status')
    }
  }
}