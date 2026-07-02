import { serializeCashIn, parseCashIn } from '../../src/settle/rail-events.codec'
import { CashInConfirmed } from '../../src/settle/rail-events'

describe('CashInConfirmed codec', () => {
  const event: CashInConfirmed = {
    reference: 'topup-empresaA-camp1-9b26edb7',
    endToEndId: 'E1393589320230727130301498341234',
    amountCents: 800000n,
    confirmedAt: new Date('2026-06-16T09:12:00.000Z'),
  }

  it('faz round-trip sem perder bigint nem Date', () => {
    expect(parseCashIn(serializeCashIn(event))).toEqual(event)
  })

  it('serializa como JSON string (bigint→string, Date→ISO)', () => {
    expect(JSON.parse(serializeCashIn(event))).toEqual({
      reference: event.reference,
      endToEndId: event.endToEndId,
      amountCents: '800000',
      confirmedAt: '2026-06-16T09:12:00.000Z',
    })
  })

  it('lança quando falta um campo obrigatório', () => {
    expect(() => parseCashIn('{"reference":"x"}')).toThrow(/missing string "endToEndId"/)
  })
})
