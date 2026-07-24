/**
 * PaymentRail — API pública (outbound) do contexto settle: como outros pedem
 * movimento de dinheiro físico. Vocabulário de domínio in/out, nada de "Celcoin";
 * `Psp` (mock) e `CelcoinPaymentRail` (real) implementam a mesma porta. O wallet
 * consome via o token `PAYMENT_RAIL`, nunca o concreto — é isso que sustenta
 * "Wallet não conhece o PSP".
 *
 * `pay` (cash-out) é o análogo outbound de `charge` (cash-in): inicia a
 * transferência (`POST /baas/v2/pix/payment`, docs/integration.md §4.2) e
 * devolve `status: 'pending'` — a confirmação de verdade chega depois pelo
 * webhook `pix-payment-out`, nunca na resposta desta chamada.
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

export type TransferStatus = 'pending' | 'confirmed' | 'failed'

export type Transfer = {
  id: string
  amountCents: bigint
  status: TransferStatus
}

/** Entrada do cash-out — só vocabulário de domínio, zero Celcoin/DICT. */
export type OpenPayout = {
  amountCents: bigint
  /** Chave Pix do recipient (já resolvida pelo Claim, sem DICT nesta fatia). */
  pixKey: string
  /** Âncora de idempotência/conciliação do domínio (→ `clientCode` no adapter). */
  reference: string
}

export interface PaymentRail {
  charge(input: OpenCharge): Promise<Charge>
  pay(input: OpenPayout): Promise<Transfer>
}

/** Token de DI — a interface some em runtime, então injetamos por token. */
export const PAYMENT_RAIL = Symbol('PAYMENT_RAIL')
