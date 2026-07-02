import * as request from 'supertest'
import { useIntegrationApp } from './setup'
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
