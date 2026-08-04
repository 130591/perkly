import { request } from './http'
import type { CampaignInput } from './types'

export async function createCampaign(input: CampaignInput) {
  return request<{ id: string }>('/campaign', { method: 'POST', body: input })
}

export async function confirmCampaign(id: string) {
  return request<void>(`/campaign/${id}/confirm`, { method: 'POST' })
}
