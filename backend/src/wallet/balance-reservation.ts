/**
 * BalanceReservation — API pública (inbound) do wallet: como outros contextos
 * pedem para comprometer ou devolver saldo. Vocabulário de domínio, zero
 * detalhe de ledger ou TypeORM. O campaign consome `reserve` via o token
 * `BALANCE_RESERVATION`, nunca o service concreto — é este contrato que
 * sustenta "módulos falam por porta, não por acesso direto". `release` existe
 * para quem precisar devolver `reserved → available` (ex.: payout expirado
 * sem resgate) — hoje ninguém chama ainda, fica pronto pro Claim.
 */

export type ReserveBalance = {
  accountId: string
  amountCents: bigint
}

export type ReleaseBalance = {
  accountId: string
  amountCents: bigint
}

export interface BalanceReservation {
  reserve(input: ReserveBalance): Promise<void>
  release(input: ReleaseBalance): Promise<void>
}

/** Token de DI — a interface some em runtime, então injetamos por token. */
export const BALANCE_RESERVATION = Symbol('BALANCE_RESERVATION')
