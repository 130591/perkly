import { z } from 'zod'

// Access token stateless, sem blacklist (RFC 0004, Decisão 4) — 15 min de TTL.
export const jwtConfigSchema = z.object({
  secret: z.string().min(1).default('dev-secret'),
  accessTokenTtlSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
})

export type JwtConfig = z.infer<typeof jwtConfigSchema>
