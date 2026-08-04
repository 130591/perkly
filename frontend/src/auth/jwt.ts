export type AccessTokenClaims = {
  sub: string
  accountId: string
  role: 'ADMIN' | 'MEMBER'
}

/** Decodes the JWT payload only — signature is verified server-side, this is display-only. */
export function decodeAccessToken(token: string): AccessTokenClaims | null {
  try {
    const [, payload] = token.split('.')
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as AccessTokenClaims
  } catch {
    return null
  }
}
