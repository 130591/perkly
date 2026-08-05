import { request } from './http'
import type { Charge, ChargeMethod, ChargeStatusView, LedgerEntry, WalletBalances } from './types'

export async function getBalances() {
  return request<WalletBalances>('/wallet/balance')
}

export async function getLedger() {
  return request<LedgerEntry[]>('/wallet/ledger')
}

/** `idempotencyKey` is the caller's — kept around afterwards to poll `getChargeStatus`. */
export async function createCharge(method: ChargeMethod, amountCents: bigint, idempotencyKey: string) {
  return request<Charge>('/wallet/charge', {
    method: 'POST',
    body: {
      method,
      amount: amountCents.toString(),
      idempotencyKey,
    },
  })
}

export async function getChargeStatus(idempotencyKey: string) {
  return request<ChargeStatusView>(`/wallet/charges/${idempotencyKey}`)
}
