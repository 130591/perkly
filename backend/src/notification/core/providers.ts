export type EmailContent = { subject: string; html: string }

export interface EmailProvider {
  send(address: string, content: EmailContent): Promise<void>
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER')

export type WhatsAppContent = {
  contentSid: string
  contentVariables: Record<string, string>
}

export interface WhatsAppProvider {
  send(number: string, content: WhatsAppContent): Promise<void>
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER')
