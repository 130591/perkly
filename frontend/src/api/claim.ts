import { request } from './http'
import type { ClaimView } from './types'

export async function getClaim(claimId: string) {
  return request<ClaimView>(`/claims/${claimId}`, { skipAuthRetry: true })
}

export async function confirmClaim(claimId: string, pixKey: string) {
  return request<ClaimView>(`/claims/${claimId}/pix-key`, {
    method: 'POST',
    body: { pixKey },
    skipAuthRetry: true,
  })
}
