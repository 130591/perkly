import { z } from 'zod'

/**
 * Segredo estático do endpoint de provisionamento de tenant (RFC 0004,
 * Decisão 10) — comparado contra o header `X-Backoffice-Token`. Mesmo
 * formato do `webhookConfigSchema`: placeholder de dev, troca por secret
 * manager em produção.
 */
export const backofficeConfigSchema = z.object({
  token: z.string().min(1).default('dev-secret'),
})

export type BackofficeConfig = z.infer<typeof backofficeConfigSchema>
