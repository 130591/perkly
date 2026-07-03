import { Campaign, Recipient } from '../../src/campaign/campaign'

// relógio fixo: os testes de expiração não podem depender do horário da máquina
const now = new Date('2026-07-02T12:00:00Z')
const future = new Date('2026-08-01T12:00:00Z')
const past = new Date('2026-06-01T12:00:00Z')

const recipient = (overrides: Partial<Recipient> = {}): Recipient => ({
  name: 'Ana',
  channel: { type: 'email', address: 'ana@example.com' },
  amountCents: 5000n,
  ...overrides,
})

const draft = (overrides: object = {}) =>
  Campaign.draft(
    {
      name: 'Pesquisa NPS',
      message: 'Obrigado por participar!',
      transferType: 'pix',
      linksExpireAt: future,
      recipients: [recipient()],
      ...overrides,
    },
    now,
  )

describe('Campaign — criação de draft', () => {
  it('cria campanha válida com status draft', () => {
    const campaign = draft()

    expect(campaign.status).toBe('draft')
    expect(campaign.name).toBe('Pesquisa NPS')
    expect(campaign.transferType).toBe('pix')
    expect(campaign.recipients).toHaveLength(1)
  })

  it('aceita recipient com canal de telefone', () => {
    const campaign = draft({
      recipients: [recipient({ channel: { type: 'phone', number: '+5511999998888' } })],
    })

    expect(campaign.recipients[0].channel.type).toBe('phone')
  })

  it('assume pix como tipo de transferência quando não informado', () => {
    const campaign = Campaign.draft(
      {
        name: 'Pesquisa NPS',
        message: 'Obrigado por participar!',
        linksExpireAt: future,
        recipients: [recipient()],
      },
      now,
    )

    expect(campaign.transferType).toBe('pix')
  })

  it('total() soma os valores de todos os recipients', () => {
    const campaign = draft({
      recipients: [
        recipient({ amountCents: 5000n }),
        recipient({ name: 'João', amountCents: 2500n }),
        recipient({ name: 'Lucas', amountCents: 111n }),
      ],
    })

    expect(campaign.total()).toBe(7611n)
  })
})

describe('Campaign — invariantes', () => {
  it('recusa campanha sem nenhum recipient', () => {
    expect(() => draft({ recipients: [] })).toThrow(
      /at least one recipient/,
    )
  })

  it('recusa recipient com valor zero', () => {
    expect(() =>
      draft({ recipients: [recipient({ amountCents: 0n })] }),
    ).toThrow(/amount must be positive/)
  })

  it('recusa recipient com valor negativo', () => {
    expect(() =>
      draft({
        recipients: [recipient(), recipient({ name: 'João', amountCents: -100n })],
      }),
    ).toThrow(/amount must be positive/)
  })

  it('recusa expiração dos links no passado', () => {
    expect(() => draft({ linksExpireAt: past })).toThrow(
      /must be in the future/,
    )
  })

  it('recusa expiração dos links igual ao agora (tem que ser estritamente futura)', () => {
    expect(() => draft({ linksExpireAt: now })).toThrow(
      /must be in the future/,
    )
  })
})

describe('Campaign — ciclo de vida', () => {
  it('confirm: draft → confirmed', () => {
    const campaign = draft()

    campaign.confirm(now)

    expect(campaign.status).toBe('confirmed')
  })

  it('recusa confirmar campanha que não está em draft', () => {
    const campaign = draft()
    campaign.confirm(now)

    expect(() => campaign.confirm(now)).toThrow(/cannot confirm/)
  })

  it('recusa confirmar quando os links já expiraram', () => {
    const afterExpiry = new Date('2026-09-01T12:00:00Z')
    const campaign = draft()

    expect(() => campaign.confirm(afterExpiry)).toThrow(/expired/)
  })

  it('startProcessing: confirmed → processing', () => {
    const campaign = draft()
    campaign.confirm(now)

    campaign.startProcessing()

    expect(campaign.status).toBe('processing')
  })

  it('recusa processar campanha ainda em draft', () => {
    expect(() => draft().startProcessing()).toThrow(/cannot start processing/)
  })

  it('complete: processing → completed', () => {
    const campaign = draft()
    campaign.confirm(now)
    campaign.startProcessing()

    campaign.complete()

    expect(campaign.status).toBe('completed')
  })

  it('recusa completar campanha que não está em processing', () => {
    const campaign = draft()
    campaign.confirm(now)

    expect(() => campaign.complete()).toThrow(/cannot complete/)
  })
})

describe('Campaign — cancelamento', () => {
  it('cancela campanha em draft', () => {
    const campaign = draft()

    campaign.cancel()

    expect(campaign.status).toBe('canceled')
  })

  it('cancela campanha confirmada (antes de processar)', () => {
    const campaign = draft()
    campaign.confirm(now)

    campaign.cancel()

    expect(campaign.status).toBe('canceled')
  })

  it('recusa cancelar campanha em processamento', () => {
    const campaign = draft()
    campaign.confirm(now)
    campaign.startProcessing()

    expect(() => campaign.cancel()).toThrow(/cannot cancel/)
  })

  it('recusa cancelar campanha completada', () => {
    const campaign = draft()
    campaign.confirm(now)
    campaign.startProcessing()
    campaign.complete()

    expect(() => campaign.cancel()).toThrow(/cannot cancel/)
  })

  it('cancelamento é terminal: não dá para confirmar depois', () => {
    const campaign = draft()
    campaign.cancel()

    expect(() => campaign.confirm(now)).toThrow(/cannot confirm/)
  })
})
