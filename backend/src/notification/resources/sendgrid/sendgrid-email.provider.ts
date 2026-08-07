import sgMail from '@sendgrid/mail'
import { EmailContent, EmailProvider } from '../../core/providers'
import { SendGridConfig } from '../../../shared/config/notification.config'

/**
 * Implementação real de `EmailProvider` sobre Twilio SendGrid. `config`
 * opcional de propósito: mesmo padrão do `CelcoinPaymentRail` — a classe
 * real existe sempre (RFC 0006, Decisão 6: sem stub), mas sem
 * `SENDGRID_API_KEY` no ambiente ela lança um erro claro em `send`, em vez
 * de falhar confuso dentro do SDK.
 */
export class SendGridEmailProvider implements EmailProvider {
  constructor(private readonly config: SendGridConfig | undefined) {
    if (this.config) {
      sgMail.setApiKey(this.config.apiKey)
    }
  }

  async send(address: string, content: EmailContent): Promise<void> {
    if (!this.config) {
      throw new Error(
        'SendGrid not configured: set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL',
      )
    }

    await sgMail.send({
      to: address,
      from: this.config.fromEmail,
      subject: content.subject,
      html: content.html,
    })
  }
}
