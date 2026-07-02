/**
 * PaymentRail — API pública (outbound) do contexto settle: como outros pedem
 * movimento de dinheiro físico. Vocabulário de domínio in/out, nada de "Celcoin";
 * `Psp` (mock) e `CelcoinPaymentRail` (real) implementam a mesma porta. O wallet
 * consome via o token `PAYMENT_RAIL`, nunca o concreto — é isso que sustenta
 * "Wallet não conhece o PSP".
 *
 * Cobre só `charge` (cash-in) por ora. `pay` (cash-out / payout) entra quando o
 * contexto Payout existir — declarar agora forçaria todo implementador a stubá-lo.
 */

export type ChargeStatus = 'pending' | 'paid' | 'expired' | 'failed'
export type ChargeMethod = 'pix' | 'boleto'

type BaseCharge = {
  id: string
  amountCents: bigint
  status: ChargeStatus
  expiresAt: Date
}

/** Instrumento é obrigatório por método — união discriminada barra estado ilegal. */
export type Charge =
  | (BaseCharge & { method: 'pix'; pixQrCode: string })
  | (BaseCharge & { method: 'boleto'; boletoLine: string })

/** Entrada da abertura de cobrança — só vocabulário de domínio, zero Celcoin. */
export type OpenCharge = {
  amountCents: bigint
  method: ChargeMethod
  /** Âncora de idempotência/conciliação do domínio (→ `clientRequestId` no adapter). */
  reference: string
  /** Segundos até expirar; o adapter aplica o default do provider se ausente. */
  expiresInSeconds?: number
}

export interface PaymentRail {
  charge(input: OpenCharge): Promise<Charge>
  // pay(payout: OpenPayout): Promise<Payout>  — cash-out, contexto Payout (depois)
}

/** Token de DI — a interface some em runtime, então injetamos por token. */
export const PAYMENT_RAIL = Symbol('PAYMENT_RAIL')
