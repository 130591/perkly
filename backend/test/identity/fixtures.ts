import { useE2eApp } from '../wallet/e2e'

type E2e = ReturnType<typeof useE2eApp>

// Default de `backoffice.config.ts` — não setado no ambiente de teste.
const BACKOFFICE_TOKEN = 'dev-secret'

type NewTenantOverrides = Partial<{
  email: string
  companyName: string
  cnpj: string
  companyPhone: string
}>

export async function provisionTenant(
  e2e: E2e,
  overrides: NewTenantOverrides = {},
) {
  const email = overrides.email ?? 'admin@acme.com'
  const res = await e2e
    .request()
    .post('/identity/backoffice/tenants')
    .set('X-Backoffice-Token', BACKOFFICE_TOKEN)
    .send({
      email,
      companyName: overrides.companyName ?? 'Acme Ltda',
      cnpj: overrides.cnpj ?? '12345678000199',
      companyPhone: overrides.companyPhone ?? '11987654321',
    })
    .expect(201)

  return {
    accountId: res.body.id as string,
    activationToken: res.body.activationToken as string,
    email,
  }
}

export async function activateAdmin(
  e2e: E2e,
  activationToken: string,
  password = 'Sup3rSecret!',
) {
  await e2e
    .request()
    .patch('/identity/activate')
    .send({ token: activationToken, password })
    .expect(200)

  return { password }
}

/** Atalho pra cenários que só precisam de um admin já logável. */
export async function provisionAndActivateAdmin(
  e2e: E2e,
  overrides?: NewTenantOverrides,
) {
  const tenant = await provisionTenant(e2e, overrides)
  const { password } = await activateAdmin(e2e, tenant.activationToken)
  return { ...tenant, password }
}

/** Extrai `nome=valor` do `Set-Cookie` de uma resposta supertest. */
export function extractCookie(
  res: { headers: Record<string, unknown> },
  name: string,
): string {
  const raw = res.headers['set-cookie'] as string[] | undefined
  const found = raw?.find((c) => c.startsWith(`${name}=`))
  if (!found) throw new Error(`cookie ${name} not set`)
  return found.split(';')[0]
}
