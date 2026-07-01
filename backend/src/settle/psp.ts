import { Charge, OpenCharge, PaymentRail } from './payment-rail'

/** Mock do PSP — implementa a porta com dados fixos. Só suporta pix por ora. */
export class Psp implements PaymentRail {
  async charge(input: OpenCharge): Promise<Charge> {
    if (input.method === 'pix') {
      return {
        id: crypto.randomUUID(),
        amountCents: input.amountCents,
        status: 'pending',
        method: 'pix',
        pixQrCode: '00020101021226980014br.gov.bcb.pix-mock-emv6304A3FF',
        expiresAt: new Date(Date.now() + (input.expiresInSeconds ?? 3600) * 1000),
      }
    }

    throw new Error(`Unsupported charge method: ${input.method}`)
  }
}
