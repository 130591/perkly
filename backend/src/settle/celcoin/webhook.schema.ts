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