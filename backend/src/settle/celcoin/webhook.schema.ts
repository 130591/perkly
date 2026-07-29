import { z } from 'zod'

export const CelcoinPixInEntitySchema = z.object({
  entity: z.literal('pix-payment-in'),
  createTimestamp: z.string(),
  status: z.string(),
  body: z.object({
    amount: z.number(),
    endToEndId: z.string(),
    clientRequestId: z.string().optional(),
    transactionIdentification: z.string().optional(),
  }),
})

export const CelcoinPixInLegacySchema = z.object({
  RequestBody: z.object({
    TransactionType: z.string(),
    Amount: z.number(),
    EndToEndId: z.string(),
    clientRequestId: z.string().optional(),
    transactionIdentification: z.string().optional(),
    StatusCode: z.object({
      Description: z.string(),
      StatusId: z.number(),
    }),
  }),
})

export const CelcoinWebhookSchema = z.union([
  CelcoinPixInEntitySchema,
  CelcoinPixInLegacySchema,
])

export type CelcoinPixIn = z.infer<typeof CelcoinWebhookSchema>
export type CelcoinPixInEntity = z.infer<typeof CelcoinPixInEntitySchema>
export type CelcoinPixInLegacy = z.infer<typeof CelcoinPixInLegacySchema>

/** `pix-payment-out` — docs/integration.md §4.3. */
export const CelcoinPixOutEntitySchema = z.object({
  entity: z.literal('pix-payment-out'),
  createTimestamp: z.string(),
  status: z.string(),
  body: z.object({
    endToEndId: z.string(),
    clientCode: z.string(),
  }),
})

export const CelcoinPixOutLegacySchema = z.object({
  RequestBody: z.object({
    TransactionType: z.string(),
    ClientCode: z.string(),
    EndToEndId: z.string(),
    StatusCode: z.object({
      Description: z.string(),
      StatusId: z.number(),
    }),
  }),
})

export const CelcoinWebhookOutSchema = z.union([
  CelcoinPixOutEntitySchema,
  CelcoinPixOutLegacySchema,
])

export type CelcoinPixOut = z.infer<typeof CelcoinWebhookOutSchema>
export type CelcoinPixOutEntity = z.infer<typeof CelcoinPixOutEntitySchema>
export type CelcoinPixOutLegacy = z.infer<typeof CelcoinPixOutLegacySchema>
