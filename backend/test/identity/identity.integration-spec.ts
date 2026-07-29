import { randomUUID } from 'crypto'
import {
  TenantProvisioningService,
  SessionService,
  PasswordRecoveryService,
} from '../../src/identity/service'
import { IdentityClient } from '../../src/identity/client'
import { RefreshTokenRepository } from '../../src/identity/database'
import { Token } from '../../src/identity/token'
import { useIntegrationApp } from '../wallet/setup'

describe('Identity', () => {
  const ctx = useIntegrationApp()

  async function provisionAndActivate(
    email = `admin-${randomUUID()}@acme.com`,
  ) {
    const service = ctx.get(TenantProvisioningService)
    const { activationToken } = await service.createTenant({
      email,
      companyName: 'Acme Ltda',
      cnpj: '12345678000199',
      companyPhone: '11987654321',
    })
    const password = 'Sup3rSecret!'
    await service.activeAdmin({ token: activationToken, password })
    return { email, password }
  }

  describe('IdentityClient (RFC 0004, Decisão 9/10)', () => {
    it('dado um usuário existente, quando busca por id, então devolve os dados; dado um id inexistente, devolve null', async () => {
      const client = ctx.get(IdentityClient)
      const { email } = await provisionAndActivate()
      const user = await ctx.ds.query(
        `SELECT external_id FROM users WHERE email = $1`,
        [email],
      )

      expect(await client.getUserById(user[0].external_id)).toEqual({
        id: user[0].external_id,
        email,
        name: null,
        role: 'ADMIN',
      })
      expect(await client.getUserById(randomUUID())).toBeNull()
    })

    it('dado uma senha definida, quando verifica (step-up), então certa retorna true e errada retorna false', async () => {
      const client = ctx.get(IdentityClient)
      const { email, password } = await provisionAndActivate()
      const user = await ctx.ds.query(
        `SELECT external_id FROM users WHERE email = $1`,
        [email],
      )
      const userId = user[0].external_id

      expect(await client.verifyPassword(userId, password)).toBe(true)
      expect(await client.verifyPassword(userId, 'senha-errada')).toBe(false)
    })
  })

  describe('dado um refresh token usado há mais de 30s (fora do grace period)', () => {
    it('quando é reutilizado, então revoga todas as sessões e nega o refresh subsequente', async () => {
      const service = ctx.get(SessionService)
      const refreshTokenRepo = ctx.get(RefreshTokenRepository)
      const { email, password } = await provisionAndActivate()

      const { refreshToken } = await service.login({ email, password })
      await service.refresh(refreshToken) // rotaciona uma vez — usedAt = agora

      // Simula o tempo passando sem esperar de verdade: backdata usedAt pra
      // além da janela de 30s (Decisão 6).
      await ctx.ds.query(
        `UPDATE refresh_tokens SET used_at = NOW() - INTERVAL '31 seconds' WHERE token_hash = $1`,
        [Token.hash(refreshToken)],
      )

      await expect(service.refresh(refreshToken)).rejects.toThrow(
        'Refresh token reuse detected',
      )

      const user = await ctx.ds.query(`SELECT id FROM users WHERE email = $1`, [
        email,
      ])
      const sessions = await refreshTokenRepo.find({
        where: { userId: user[0].id },
      })
      expect(sessions.every((s) => s.revokedAt !== null)).toBe(true)
    })
  })

  describe('dado um pedido de recuperação de senha', () => {
    it('quando confirma com o token, então a senha muda e todas as sessões anteriores são revogadas', async () => {
      const session = ctx.get(SessionService)
      const passwordRecovery = ctx.get(PasswordRecoveryService)
      const refreshTokenRepo = ctx.get(RefreshTokenRepository)
      const { email, password } = await provisionAndActivate()
      const { refreshToken } = await session.login({ email, password })

      // O token cru nunca é devolvido pela API (anti-enumeração, task 08) —
      // espiar `Token.generate` é o único jeito honesto de obtê-lo em teste.
      const spy = jest.spyOn(Token, 'generate')
      await passwordRecovery.requestPasswordReset(email)
      const rawToken = spy.mock.results.at(-1)!.value.token as string
      spy.mockRestore()

      const newPassword = 'NovaSenha!2'
      await passwordRecovery.confirmPasswordReset({
        token: rawToken,
        password: newPassword,
      })

      await expect(session.login({ email, password })).rejects.toThrow(
        'Invalid credentials',
      )
      await expect(
        session.login({ email, password: newPassword }),
      ).resolves.toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      })

      const priorSession = await refreshTokenRepo.findOne({
        where: { tokenHash: Token.hash(refreshToken) },
      })
      expect(priorSession?.revokedAt).not.toBeNull()
    })
  })
})
