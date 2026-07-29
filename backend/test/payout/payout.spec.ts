import { Payout, PayoutDraft } from '../../src/payout/payout'
import { Recipient } from '../../src/campaign/domain/batch'

const now = new Date('2026-07-02T12:00:00Z')
const future = new Date('2026-08-01T12:00:00Z')

const recipient = (overrides: Partial<Recipient> = {}): Recipient => ({
  name: 'Ana',
  channel: { type: 'email', address: 'ana@example.com' },
  amountCents: 5000n,
  ...overrides,
})

const draft = (overrides: Partial<PayoutDraft> = {}): PayoutDraft => ({
  campaignId: '11111111-1111-1111-1111-111111111111',
  accountId: '22222222-2222-2222-2222-222222222222',
  recipient: recipient(),
  linksExpireAt: future,
  ...overrides,
})

const payout = (overrides: Partial<PayoutDraft> = {}) =>
  Payout.draft(draft(overrides), now)

describe('Payout — criação', () => {
  it('nasce pending', () => {
    expect(payout().status).toBe('pending')
  })

  it('recusa prazo de resgate no passado', () => {
    expect(() => payout({ linksExpireAt: now })).toThrow('expired')
  })
})

describe('Payout — startProcessing (Claim confirmou)', () => {
  it('guarda a chave Pix recebida e transiciona pra processing', () => {
    const p = payout()

    p.startProcessing('ana@pix.com')

    expect(p.status).toBe('processing')
    expect(p.pixKey).toBe('ana@pix.com')
  })

  it('recusa processar um payout que não está pending', () => {
    const p = payout()
    p.startProcessing('ana@pix.com')

    expect(() => p.startProcessing('ana@pix.com')).toThrow('invalid status')
  })
})

describe('Payout — markPaid (PSP confirmou o Pix)', () => {
  it('marca pago só a partir de processing', () => {
    const p = payout()
    p.startProcessing('ana@pix.com')

    p.markPaid()

    expect(p.status).toBe('paid')
  })

  it('recusa marcar pago sem antes estar processando', () => {
    const p = payout()
    expect(() => p.markPaid()).toThrow('invalid status')
  })
})

describe('Payout — markFailed', () => {
  it('marca falho só a partir de processing', () => {
    const p = payout()
    p.startProcessing('ana@pix.com')

    p.markFailed()

    expect(p.status).toBe('failed')
  })

  it('recusa marcar falho sem antes estar processando', () => {
    const p = payout()
    expect(() => p.markFailed()).toThrow('invalid status')
  })
})

describe('Payout — expire (Claim expirou)', () => {
  it('expira só a partir de pending', () => {
    const p = payout()

    p.expire()

    expect(p.status).toBe('expired')
  })

  it('recusa expirar um payout que já está processando', () => {
    const p = payout()
    p.startProcessing('ana@pix.com')

    expect(() => p.expire()).toThrow('invalid status')
  })
})
