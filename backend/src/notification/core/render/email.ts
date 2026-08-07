import { readFileSync } from 'fs'
import { join } from 'path'
import * as Handlebars from 'handlebars'
import { NotificationRequest, NotificationReason } from '../notifier'
import { EmailContent } from '../providers'
import { Money } from '../money'
import { DateFormat } from '../date'

const TEMPLATES_DIR = join(__dirname, '../../templates')

const compile = (reason: NotificationReason) =>
  Handlebars.compile(
    readFileSync(join(TEMPLATES_DIR, `${reason}.hbs`), 'utf-8'),
  )

const templates: Record<NotificationReason, HandlebarsTemplateDelegate> = {
  'claim-link-ready': compile('claim-link-ready'),
  'tenant-activation': compile('tenant-activation'),
  'member-invited': compile('member-invited'),
  'password-reset-requested': compile('password-reset-requested'),
}

export class EmailRender {
  static render(request: NotificationRequest): EmailContent {
    switch (request.reason) {
      case 'claim-link-ready':
        return {
          subject: `Você recebeu ${Money.formatBRL(request.context.amountCents)}!`,
          html: templates[request.reason]({
            name: request.context.name,
            amount: Money.formatBRL(request.context.amountCents),
            expiresAt: DateFormat.short(request.context.expiresAt),
            link: request.context.link,
          }),
        }
      case 'tenant-activation':
        return {
          subject: 'Ative sua conta Perkly',
          html: templates[request.reason](request.context),
        }
      case 'member-invited':
        return {
          subject: `Você foi convidado para ${request.context.tenantName} na Perkly`,
          html: templates[request.reason](request.context),
        }
      case 'password-reset-requested':
        return {
          subject: 'Recuperação de senha Perkly',
          html: templates[request.reason](request.context),
        }
    }
  }
}
