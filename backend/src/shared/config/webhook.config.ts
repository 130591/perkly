import { z } from 'zod'

/**
 * Verificação do webhook. `secret` é placeholder de dev — a Celcoin real usa
 * BASIC AUTH no cadastro (integration.md §6). Quando a credencial chegar, muda
 * só o WebhookGuard; este schema absorve o formato que ela exigir.
 */
export const webhookConfigSchema = z.object({
  secret: z.string().min(1).default('dev-secret'),
})

export type WebhookConfig = z.infer<typeof webhookConfigSchema>
