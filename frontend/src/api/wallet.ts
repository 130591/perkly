import { request } from './http'
import type { Charge, ChargeMethod, WalletBalances } from './types'

export async function getBalances() {
  return request<WalletBalances>('/wallet/balance')
}

export async function createCharge(method: ChargeMethod, amountCents: bigint) {
  return request<Charge>('/wallet/charge', {
    method: 'POST',
    body: {
      method,
      amount: amountCents.toString(),
      idempotencyKey: crypto.randomUUID(),
    },
  })
}
