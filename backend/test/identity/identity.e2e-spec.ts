import { useE2eApp } from '../wallet/e2e'
import {
  provisionTenant,
  provisionAndActivateAdmin,
  activateAdmin,
  extractCookie,
} from './fixtures'

describe('Identity (e2e)', () => {
  const e2e = useE2eApp()

  describe('dado um provisionamento de tenant sem o header de backoffice', () => {
    it('quando chama o endpoint, então recusa com 401', async () => {
      await e2e
        .request()
        .post('/identity/backoffice/tenants')
        .send({
          email: 'a@a.com',
          companyName: 'Acme',
          cnpj: '12345678000199',
          companyPhone: '11987654321',
        })
        .expect(401)
    })
  })

  describe('dado um tenant provisionado e o admin ativado', () => {
    it('quando loga com a senha definida, então recebe access token e cookie de refresh', async () => {
      const { email, password } = await provisionAndActivateAdmin(e2e)

      const res = await e2e
        .request()
        .post('/identity/login')
        .send({ email, password })
        .expect(201)

      expect(res.body).toEqual({ accessToken: expect.any(String) })
      expect(extractCookie(res, 'refreshToken')).toMatch(/^refreshToken=.+/)
    })
  })

  describe('dado um admin recém-provisionado ainda não ativado', () => {
    it('quando tenta logar, então recusa com mensagem de ativação pendente', async () => {
      const { email } = await provisionTenant(e2e)

      const res = await e2e
        .request()
        .post('/identity/login')
        .send({ email, password: 'qualquer-coisa' })
        .expect(401)

      expect(res.body.message).toMatch(/not activated/i)
    })
  })

  describe('dado um refresh token recém-trocado', () => {
    it('quando é reusado quase imediatamente (retry de rede), então ainda funciona — grace period', async () => {
      const { email, password } = await provisionAndActivateAdmin(e2e)
      const loginRes = await e2e
        .request()
        .post('/identity/login')
        .send({ email, password })
        .expect(201)
      const originalCookie = extractCookie(loginRes, 'refreshToken')

      await e2e
        .request()
        .post('/identity/refresh')
        .set('Cookie', originalCookie)
        .expect(201)

      // reuso do MESMO cookie já trocado, dentro da janela de 30s — não pune
      await e2e
        .request()
        .post('/identity/refresh')
        .set('Cookie', originalCookie)
        .expect(201)
    })
  })

  describe('dado um logout', () => {
    it('quando tenta renovar a sessão com o cookie revogado, então recusa', async () => {
      const { email, password } = await provisionAndActivateAdmin(e2e)
      const loginRes = await e2e
        .request()
        .post('/identity/login')
        .send({ email, password })
        .expect(201)
      const cookie = extractCookie(loginRes, 'refreshToken')

      await e2e
        .request()
        .post('/identity/logout')
        .set('Cookie', cookie)
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(201)

      await e2e
        .request()
        .post('/identity/refresh')
        .set('Cookie', cookie)
        .expect(401)
    })
  })

  describe('dado um convite de membro aceito', () => {
    it('quando o convidado loga, então acessa com o role recebido', async () => {
      const { accountId, email, password } =
        await provisionAndActivateAdmin(e2e)
      const adminLoginRes = await e2e
        .request()
        .post('/identity/login')
        .send({ email, password })
        .expect(201)

      const inviteRes = await e2e
        .request()
        .post(`/identity/tenants/${accountId}/invitations`)
        .set('Authorization', `Bearer ${adminLoginRes.body.accessToken}`)
        .send({ email: 'membro@acme.com', role: 'MEMBER' })
        .expect(201)

      await e2e
        .request()
        .post(`/identity/invitations/${inviteRes.body.invitationToken}/accept`)
        .send({ name: 'Membro', password: 'OutraSenha!1' })
        .expect(201)

      const loginRes = await e2e
        .request()
        .post('/identity/login')
        .send({ email: 'membro@acme.com', password: 'OutraSenha!1' })
        .expect(201)

      expect(loginRes.body).toEqual({ accessToken: expect.any(String) })

      // RolesGuard (RFC 0005, task 05): convidar é ADMIN-only — MEMBER recusa.
      await e2e
        .request()
        .post(`/identity/tenants/${accountId}/invitations`)
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({ email: 'outro@acme.com', role: 'MEMBER' })
        .expect(403)
    })
  })

  describe('dado um pedido de recuperação de senha', () => {
    it('quando o e-mail não existe, então responde com a mesma mensagem genérica de quando existe', async () => {
      const { email } = await provisionAndActivateAdmin(e2e)

      const existing = await e2e
        .request()
        .post('/identity/password-resets')
        .send({ email })
        .expect(201)

      const missing = await e2e
        .request()
        .post('/identity/password-resets')
        .send({ email: 'nao-existe@acme.com' })
        .expect(201)

      expect(missing.body).toEqual(existing.body)
    })
  })

  describe('dado um usuário ativado', () => {
    it('quando ativa de novo com o mesmo token, então recusa (uso único)', async () => {
      const { activationToken } = await provisionTenant(e2e)
      await activateAdmin(e2e, activationToken)

      await e2e
        .request()
        .patch('/identity/activate')
        .send({ token: activationToken, password: 'Outra!123' })
        .expect(400)
    })
  })
})
