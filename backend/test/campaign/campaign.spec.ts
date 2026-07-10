import { Campaign } from '../../src/campaign/campaign'
import { Batch, Recipient, BatchDraft } from '../../src/campaign/batch'

// relógio fixo: os testes de expiração não podem depender do horário da máquina
const now = new Date('2026-07-02T12:00:00Z')
const future = new Date('2026-08-01T12:00:00Z')
const past = new Date('2026-06-01T12:00:00Z')
const afterExpiry = new Date('2026-09-01T12:00:00Z')

const recipient = (overrides: Partial<Recipient> = {}): Recipient => ({
  name: 'Ana',
  channel: { type: 'email', address: 'ana@example.com' },
  amountCents: 5000n,
  ...overrides,
})

const batchDraft = (overrides: Partial<BatchDraft> = {}): BatchDraft => ({
  linksExpireAt: future,
  recipients: [recipient()],
  ...overrides,
})

const batch = (overrides: Partial<BatchDraft> = {}) =>
  Batch.create(batchDraft(overrides), now)

const campaign = (overrides: object = {}) =>
  Campaign.draft(
    {
      accountId: '11111111-1111-1111-1111-111111111111',
      name: 'Pesquisa NPS',
      message: 'Obrigado por participar!',
      transferType: 'pix',
      batches: [batchDraft()],
      ...overrides,
    },
    now,
  )

describe('Batch — criação', () => {
  it('agrupa seus recipients', () => {
    const b = batch()

    expect(b.recipients).toHaveLength(1)
  })

  it('aceita recipient com canal de telefone', () => {
    const b = batch({
      recipients: [recipient({ channel: { type: 'phone', number: '+5511999998888' } })],
    })

    expect(b.recipients[0].channel.type).toBe('phone')
  })

  it('total() soma os valores de todos os recipients', () => {
    const b = batch({
      recipients: [
        recipient({ amountCents: 5000n }),
        recipient({ name: 'João', amountCents: 2500n }),
        recipient({ name: 'Lucas', amountCents: 111n }),
      ],
    })

    expect(b.total()).toBe(7611n)
  })
})

describe('Batch — invariantes', () => {
  it('recusa batch sem nenhum recipient', () => {
    expect(() => batch({ recipients: [] })).toThrow(/at least one recipient/)
  })

  it('recusa recipient com valor zero', () => {
    expect(() => batch({ recipients: [recipient({ amountCents: 0n })] })).toThrow(
      /amount must be positive/,
    )
  })

  it('recusa recipient com valor negativo', () => {
    expect(() =>
      batch({ recipients: [recipient(), recipient({ name: 'João', amountCents: -100n })] }),
    ).toThrow(/amount must be positive/)
  })

  it('recusa expiração dos links no passado', () => {
    expect(() => batch({ linksExpireAt: past })).toThrow(/must be in the future/)
  })

  it('recusa expiração dos links igual ao agora (tem que ser estritamente futura)', () => {
    expect(() => batch({ linksExpireAt: now })).toThrow(/must be in the future/)
  })
})

describe('Campaign — criação', () => {
  it('cria campanha em draft agrupando seus batches', () => {
    const c = campaign()

    expect(c.status).toBe('draft')
    expect(c.name).toBe('Pesquisa NPS')
    expect(c.transferType).toBe('pix')
    expect(c.batches).toHaveLength(1)
  })

  it('assume pix como tipo de transferência quando não informado', () => {
    const c = Campaign.draft(
      {
        accountId: '11111111-1111-1111-1111-111111111111',
        name: 'Pesquisa NPS',
        message: 'Obrigado por participar!',
        batches: [batchDraft()],
      },
      now,
    )

    expect(c.transferType).toBe('pix')
  })

  it('total() soma o total de todos os batches', () => {
    const c = campaign({
      batches: [
        batchDraft({ recipients: [recipient({ amountCents: 5000n })] }),
        batchDraft({
          recipients: [recipient({ amountCents: 2500n }), recipient({ amountCents: 111n })],
        }),
      ],
    })

    expect(c.total()).toBe(7611n)
  })

  it('propaga a invariante do batch na criação (batch sem recipient)', () => {
    expect(() => campaign({ batches: [batchDraft({ recipients: [] })] })).toThrow(
      /at least one recipient/,
    )
  })
})

describe('Campaign — activate', () => {
  it('ativa a campanha (draft → active)', () => {
    const c = campaign({ batches: [batchDraft(), batchDraft()] })

    c.activate(now)

    expect(c.status).toBe('active')
  })

  it('recusa ativar campanha que não está em draft', () => {
    const c = campaign()
    c.activate(now)
    expect(() => c.activate(now)).toThrow(/not draft/)
  })

  it('falha (e não transiciona) se um batch estiver expirado', () => {
    const c = campaign()

    expect(() => c.activate(afterExpiry)).toThrow(/batch expired/)
    expect(c.status).toBe('draft')
  })
})
