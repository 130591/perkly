import {
  normalizeCashIn,
  normalizePayoutConfirmed,
  CelcoinPixIn,
  CelcoinPixOut,
} from '../../src/settle/celcoin/webhook.normalizer'

describe('normalizeCashIn', () => {
  const entity = (over: Partial<{ status: string; amount: number }> = {}): CelcoinPixIn => ({
    entity: 'pix-payment-in',
    createTimestamp: '2026-06-16T09:12:00.000+00:00',
    status: over.status ?? 'CONFIRMED',
    body: {
      amount: over.amount ?? 8000.0,
      endToEndId: 'E1393589320230727130301498341234',
      clientRequestId: 'topup-empresaA-camp1-9b26edb7',
    },
  })

  it('normaliza o formato novo (entity) para CashInConfirmed', () => {
    expect(normalizeCashIn(entity())).toEqual({
      reference: 'topup-empresaA-camp1-9b26edb7',
      endToEndId: 'E1393589320230727130301498341234',
      amountCents: 800000n,
      confirmedAt: new Date('2026-06-16T09:12:00.000+00:00'),
    })
  })

  it('normaliza o formato legado (RequestBody) para CashInConfirmed', () => {
    const legacy: CelcoinPixIn = {
      RequestBody: {
        TransactionType: 'RECEIVEPIX',
        Amount: 40000.0,
        EndToEndId: 'E1393589320230727130301498341234',
        transactionIdentification: 'topup-empresaA-camp1',
        StatusCode: { Description: 'confirmed', StatusId: 2 },
      },
    }
    const result = normalizeCashIn(legacy)
    expect(result.reference).toBe('topup-empresaA-camp1')
    expect(result.endToEndId).toBe('E1393589320230727130301498341234')
    expect(result.amountCents).toBe(4000000n)
  })

  it('aceita transactionIdentification como âncora quando falta clientRequestId', () => {
    const payload = entity()
    delete (payload as any).body.clientRequestId
    ;(payload as any).body.transactionIdentification = 'topup-static-1'
    expect(normalizeCashIn(payload).reference).toBe('topup-static-1')
  })

  it('converte reais decimais para cents', () => {
    expect(normalizeCashIn(entity({ amount: 739.5 })).amountCents).toBe(73950n)
  })

  it('lança quando o pix-payment-in não está confirmado', () => {
    expect(() => normalizeCashIn(entity({ status: 'PROCESSING' }))).toThrow(/not confirmed/)
  })

  it('lança quando não há âncora de correlação', () => {
    const payload = entity()
    delete (payload as any).body.clientRequestId
    expect(() => normalizeCashIn(payload)).toThrow(/correlation anchor/)
  })
})

describe('normalizePayoutConfirmed', () => {
  const entity = (over: Partial<{ status: string }> = {}): CelcoinPixOut => ({
    entity: 'pix-payment-out',
    createTimestamp: '2026-06-16T09:12:00.000+00:00',
    status: over.status ?? 'CONFIRMED',
    body: {
      endToEndId: 'E1393589320230727130301498341234',
      clientCode: 'payout-camp1-recipient42-uuid',
    },
  })

  it('normaliza o formato novo (entity) para PayoutConfirmed', () => {
    expect(normalizePayoutConfirmed(entity())).toEqual({
      reference: 'payout-camp1-recipient42-uuid',
      endToEndId: 'E1393589320230727130301498341234',
      confirmedAt: new Date('2026-06-16T09:12:00.000+00:00'),
    })
  })

  it('normaliza o formato legado (RequestBody) para PayoutConfirmed', () => {
    const legacy: CelcoinPixOut = {
      RequestBody: {
        TransactionType: 'PAYMENT',
        ClientCode: 'payout-camp1-recipient42-uuid',
        EndToEndId: 'E1393589320230727130301498341234',
        StatusCode: { Description: 'confirmed', StatusId: 2 },
      },
    }
    const result = normalizePayoutConfirmed(legacy)
    expect(result.reference).toBe('payout-camp1-recipient42-uuid')
    expect(result.endToEndId).toBe('E1393589320230727130301498341234')
  })

  it('lança quando o pix-payment-out não está confirmado (formato novo)', () => {
    expect(() => normalizePayoutConfirmed(entity({ status: 'ERROR' }))).toThrow(/not confirmed/)
  })

  it('lança quando o pix-payment-out não está confirmado (formato legado)', () => {
    const legacy: CelcoinPixOut = {
      RequestBody: {
        TransactionType: 'PAYMENT',
        ClientCode: 'payout-camp1-recipient42-uuid',
        EndToEndId: 'E1393589320230727130301498341234',
        StatusCode: { Description: 'error', StatusId: 3 },
      },
    }
    expect(() => normalizePayoutConfirmed(legacy)).toThrow(/not confirmed/)
  })
})
