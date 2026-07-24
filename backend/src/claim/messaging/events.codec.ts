import { ClaimConfirmed, ClaimExpired } from './events'

/**
 * Codec do wire-format de `ClaimConfirmed`/`ClaimExpired` no SQS. Mesmo motivo
 * do codec do payout: conhecimento ÚNICO da forma na fila (DRY), `parse`
 * (consumidor) ao lado do `serialize` (produtor, aqui) pra não divergir. Sem
 * `bigint`/`Date` nos dois eventos — só `payoutId`/`pixKey`, então o JSON é
 * quase 1:1; o que sobra é validar a forma na borda em vez de confiar cego no
 * `JSON.parse`.
 */
export function serializeClaimConfirmed(event: ClaimConfirmed): string {
  return JSON.stringify({ payoutId: event.payoutId, pixKey: event.pixKey })
}

export function parseClaimConfirmed(body: string): ClaimConfirmed {
  const raw = JSON.parse(body) as Record<string, unknown>
  return new ClaimConfirmed(asString(raw, 'payoutId'), asString(raw, 'pixKey'))
}

export function serializeClaimExpired(event: ClaimExpired): string {
  return JSON.stringify({ payoutId: event.payoutId })
}

export function parseClaimExpired(body: string): ClaimExpired {
  const raw = JSON.parse(body) as Record<string, unknown>
  return new ClaimExpired(asString(raw, 'payoutId'))
}

const asString = (raw: Record<string, unknown>, key: string): string => {
  const value = raw[key]
  if (typeof value !== 'string') {
    throw new Error(`Claim event payload missing string "${key}"`)
  }
  return value
}
