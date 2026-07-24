/**
 * BalanceReservation — API pública (inbound) do wallet: como outros contextos
 * pedem para comprometer, devolver ou consumir saldo. Vocabulário de domínio,
 * zero detalhe de ledger ou TypeORM. O campaign consome `reserve`, o payout
 * consome `release` (resgate expirado) e `settle` (Pix confirmado pelo PSP)
 * via o token `BALANCE_RESERVATION`, nunca o service concreto — é este
 * contrato que sustenta "módulos falam por porta, não por acesso direto".
 *
 * `reserve`/`release`/`settle` são os três movimentos do mesmo saldo
 * reservado (available→reserved, reserved→available, reserved→external);
 * por isso vivem na mesma porta em vez de token separado por operação.
 */

export type ReserveBalance = {
  accountId: string
  amountCents: bigint
  /** Chave de idempotência do chamador — reentrega vira no-op. */
  idempotencyKey: string
}

export type ReleaseBalance = {
  accountId: string
  amountCents: bigint
  /** Chave de idempotência do chamador — reentrega vira no-op. */
  idempotencyKey: string
}

export type SettleBalance = {
  accountId: string
  amountCents: bigint
  /** Taxa da plataforma sobre a transação (conta `revenue`). `0n` se nenhuma. */
  fee: bigint
  /** Chave de idempotência do chamador — reentrega vira no-op. */
  idempotencyKey: string
}

export interface BalanceReservation {
  reserve(input: ReserveBalance): Promise<void>
  release(input: ReleaseBalance): Promise<void>
  /** Consome a reserva de vez (reserved → external + revenue) — dinheiro saiu de verdade. */
  settle(input: SettleBalance): Promise<void>
}

/** Token de DI — a interface some em runtime, então injetamos por token. */
export const BALANCE_RESERVATION = Symbol('BALANCE_RESERVATION')
