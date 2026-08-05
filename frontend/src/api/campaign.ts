import { request } from './http'
import type { CampaignInput, CampaignRecipientsPage, CampaignSummary } from './types'

export async function createCampaign(input: CampaignInput) {
  return request<{ id: string }>('/campaign', { method: 'POST', body: input })
}

export async function confirmCampaign(id: string) {
  return request<void>(`/campaign/${id}/confirm`, { method: 'POST' })
}

export async function listCampaigns() {
  return request<CampaignSummary[]>('/campaign')
}

export async function getCampaign(id: string) {
  return request<CampaignSummary>(`/campaign/${id}`)
}

export async function listRecipients(id: string, page: number, pageSize: number) {
  return request<CampaignRecipientsPage>(`/campaign/${id}/recipients?page=${page}&pageSize=${pageSize}`)
}
