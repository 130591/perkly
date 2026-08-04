import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { login as apiLogin, logout as apiLogout } from '../api/identity'
import { request } from '../api/http'
import { getAccessToken, onAccessTokenChange, setAccessToken } from '../api/http'
import { decodeAccessToken, type AccessTokenClaims } from './jwt'
import type { LoginResponse } from '../api/types'

type AuthState = {
  user: AccessTokenClaims | null
  status: 'loading' | 'authenticated' | 'anonymous'
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(getAccessToken())
  const [status, setStatus] = useState<AuthState['status']>('loading')

  useEffect(() => onAccessTokenChange(setToken), [])

  useEffect(() => {
    let cancelled = false
    request<LoginResponse>('/identity/refresh', { method: 'POST', skipAuthRetry: true })
      .then((res) => {
        if (cancelled) return
        setAccessToken(res.accessToken)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user: token ? decodeAccessToken(token) : null,
      status,
      login: async (email, password) => {
        await apiLogin(email, password)
        setStatus('authenticated')
      },
      logout: async () => {
        await apiLogout()
        setStatus('anonymous')
      },
    }),
    [token, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
