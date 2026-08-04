import { request, setAccessToken } from './http'
import type { LoginResponse, UserRole } from './types'

export async function login(email: string, password: string) {
  const res = await request<LoginResponse>('/identity/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRetry: true,
  })
  setAccessToken(res.accessToken)
  return res
}

export async function logout() {
  await request<void>('/identity/logout', { method: 'POST', skipAuthRetry: true })
  setAccessToken(null)
}

export async function inviteMember(tenantId: string, email: string, role: UserRole) {
  return request<void>(`/identity/tenants/${tenantId}/invitations`, {
    method: 'POST',
    body: { email, role },
  })
}

export async function acceptInvitation(token: string, name: string, password: string) {
  return request<void>(`/identity/invitations/${token}/accept`, {
    method: 'POST',
    body: { name, password },
    skipAuthRetry: true,
  })
}

export async function requestPasswordReset(email: string) {
  return request<void>('/identity/password-resets', {
    method: 'POST',
    body: { email },
    skipAuthRetry: true,
  })
}

export async function confirmPasswordReset(token: string, password: string) {
  return request<void>(`/identity/password-resets/${token}/confirm`, {
    method: 'POST',
    body: { password },
    skipAuthRetry: true,
  })
}
