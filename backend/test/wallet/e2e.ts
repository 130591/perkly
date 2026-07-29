import { randomUUID } from 'crypto'
import * as request from 'supertest'
import { JwtService } from '@nestjs/jwt'
import { UserRole } from '../../src/identity/database'
import { IntegrationContext, useIntegrationApp } from './setup'
export { seedWallet } from './setup'

/**
 * Infra de teste e2e: sobe o app inteiro sobre um Postgres real (mesmo harness
 * da integração) e entrega um supertest já apontado para o servidor HTTP — os
 * testes batem na API de fora, sem tocar em providers.
 *
 * ```ts
 * describe('GET /wallets/:accountId/balances (e2e)', () => {
 *   const e2e = useE2eApp()
 *   it('...', () => e2e.request().get('/wallets/...').expect(200))
 * })
 * ```
 */
export function useE2eApp() {
  const ctx = useIntegrationApp()

  return {
    ctx,
    request: () => request(ctx.http()),
  }
}

/**
 * Assina um access token válido (mesmo payload que `Service.issueTokens`
 * emite) pra bater em rotas atrás do guard global (RFC 0005, task 01) sem
 * precisar de um fluxo de login completo.
 */
export function signAccessToken(
  ctx: IntegrationContext,
  overrides: Partial<{ accountId: string; role: UserRole }> = {},
): string {
  return ctx.get(JwtService).sign({
    sub: randomUUID(),
    accountId: overrides.accountId ?? randomUUID(),
    role: overrides.role ?? 'ADMIN',
  })
}
