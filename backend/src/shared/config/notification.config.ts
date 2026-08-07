import { z } from 'zod'

/**
 * WhatsApp (Twilio). `templates` são os `ContentSid` por `reason` — cada
 * um só existe depois de criado no Content Template Builder e aprovado pela
 * Meta (RFC 0006, Camada 3), por isso são opcionais mesmo com a conta
 * Twilio configurada: a conta pode estar pronta antes de qualquer template
 * estar aprovado.
 */
export const twilioConfigSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  whatsappFrom: z.string().min(1),
  templates: z.object({
    claimLinkReady: z.string().optional(),
    tenantActivation: z.string().optional(),
    memberInvited: z.string().optional(),
    passwordResetRequested: z.string().optional(),
  }),
})

export type TwilioConfig = z.infer<typeof twilioConfigSchema>

/** E-mail (Twilio SendGrid) — credencial própria, separada da conta Twilio principal. */
export const sendgridConfigSchema = z.object({
  apiKey: z.string().min(1),
  fromEmail: z.string().email(),
})

export type SendGridConfig = z.infer<typeof sendgridConfigSchema>
