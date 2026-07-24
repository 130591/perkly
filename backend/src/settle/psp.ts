import { Charge, OpenCharge, OpenPayout, PaymentRail, Transfer } from './payment-rail'

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

  // Devolve 'pending' — mesmo formato do PSP real (§4.2: aceita e aguarda o
  // webhook pix-payment-out confirmar). O mock não dispara o webhook sozinho;
  // quem simula a confirmação em dev/teste é uma chamada explícita ao endpoint.
  async pay(input: OpenPayout): Promise<Transfer> {
    return {
      id: crypto.randomUUID(),
      amountCents: input.amountCents,
      status: 'pending',
    }
  }
}
