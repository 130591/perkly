import { z } from 'zod'

export const celcoinConfigSchema = z.object({
  baseUrl: z.string().url().default('https://openfinance.celcoin.dev'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  /** Chave PIX da conta bolsão Perkly na Celcoin (recebe o cash-in). */
  pixKey: z.string().min(1),
})

export type CelcoinConfig = z.infer<typeof celcoinConfigSchema>
