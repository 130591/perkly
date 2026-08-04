const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type AccessTokenListener = (token: string | null) => void

// In-memory only — never localStorage. The refresh token lives in an
// httpOnly cookie the browser manages; this is just the short-lived
// access token for the current tab's lifetime (RFC 0004).
let accessToken: string | null = null
const listeners = new Set<AccessTokenListener>()

export function setAccessToken(token: string | null) {
  accessToken = token
  for (const listen of listeners) listen(token)
}

export function getAccessToken() {
  return accessToken
}

export function onAccessTokenChange(listener: AccessTokenListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    if (Array.isArray(body.message)) return body.message.join(' ')
    if (body.message) return body.message
  } catch {
    // response had no JSON body
  }
  return `Erro inesperado (${res.status}).`
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/identity/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        setAccessToken(null)
        return false
      }
      const body = (await res.json()) as { accessToken: string }
      setAccessToken(body.accessToken)
      return true
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Skip the 401 -> refresh -> retry dance (used by login/refresh themselves). */
  skipAuthRetry?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuthRetry = false } = options

  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

  let res = await doFetch()

  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshSession()
    if (refreshed) res = await doFetch()
  }

  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
