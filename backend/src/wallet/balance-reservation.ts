/**
 * BalanceReservation — API pública (inbound) do wallet: como outros contextos
 * pedem para comprometer saldo. Vocabulário de domínio, zero detalhe de ledger
 * ou TypeORM. O campaign consome via o token `BALANCE_RESERVATION`, nunca o
 * service concreto — é este contrato que sustenta "módulos falam por porta,
 * não por acesso direto".
 *
 * Cobre só `reserve` (available → reserved) por ora. `release`/`consume` entram
 * quando o fluxo de payout existir — declarar agora forçaria stub sem uso.
 */

export type ReserveBalance = {
  accountId: string
  amountCents: bigint
}

export interface BalanceReservation {
  reserve(input: ReserveBalance): Promise<void>
}

/** Token de DI — a interface some em runtime, então injetamos por token. */
export const BALANCE_RESERVATION = Symbol('BALANCE_RESERVATION')
