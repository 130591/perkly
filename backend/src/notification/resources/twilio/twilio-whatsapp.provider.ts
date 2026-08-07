import * as twilio from 'twilio'
import { WhatsAppContent, WhatsAppProvider } from '../../core/providers'
import { TwilioConfig } from '../../../shared/config/notification.config'

/**
 * Implementação real de `WhatsAppProvider` sobre a Content API do Twilio
 * (`ContentSid` + `ContentVariables`, RFC 0006 Camada 3). `config` opcional
 * de propósito — mesmo padrão do `CelcoinPaymentRail`: a classe real existe
 * sempre (Decisão 6: sem stub), mas sem `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN` no
 * ambiente ela lança um erro claro em `send`. Templates por `reason` (dentro
 * de `content.contentSid`, já resolvido pelo `WhatsAppRender`) têm sua
 * própria checagem — essa é sobre a conta em si, não sobre qual template.
 */
export class TwilioWhatsAppProvider implements WhatsAppProvider {
  private readonly client: twilio.Twilio | undefined

  constructor(private readonly config: TwilioConfig | undefined) {
    if (this.config) {
      this.client = twilio(this.config.accountSid, this.config.authToken)
    }
  }

  async send(number: string, content: WhatsAppContent): Promise<void> {
    if (!this.config || !this.client) {
      throw new Error(
        'Twilio not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM',
      )
    }

    await this.client.messages.create({
      contentSid: content.contentSid,
      contentVariables: JSON.stringify(content.contentVariables),
      from: this.config.whatsappFrom,
      to: `whatsapp:${number}`,
    })
  }
}
