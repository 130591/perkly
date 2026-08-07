import { NotificationRequest } from '../notifier'
import { WhatsAppContent } from '../providers'
import { Money } from '../money'

export type WhatsAppTemplates = {
  claimLinkReady?: string
  tenantActivation?: string
  memberInvited?: string
  passwordResetRequested?: string
}

export class WhatsAppRender {
  static render(
    request: NotificationRequest,
    templates: WhatsAppTemplates,
  ): WhatsAppContent {
    switch (request.reason) {
      case 'claim-link-ready':
        return {
          contentSid: WhatsAppRender.requireTemplate(
            templates.claimLinkReady,
            request.reason,
          ),
          contentVariables: {
            '1': request.context.name,
            '2': Money.formatBRL(request.context.amountCents),
            '3': request.context.link,
          },
        }
      case 'tenant-activation':
        return {
          contentSid: WhatsAppRender.requireTemplate(
            templates.tenantActivation,
            request.reason,
          ),
          contentVariables: {
            '1': request.context.name,
            '2': request.context.activationLink,
          },
        }
      case 'member-invited':
        return {
          contentSid: WhatsAppRender.requireTemplate(
            templates.memberInvited,
            request.reason,
          ),
          contentVariables: {
            '1': request.context.name,
            '2': request.context.tenantName,
            '3': request.context.inviteLink,
          },
        }
      case 'password-reset-requested':
        return {
          contentSid: WhatsAppRender.requireTemplate(
            templates.passwordResetRequested,
            request.reason,
          ),
          contentVariables: {
            '1': request.context.name,
            '2': request.context.resetLink,
          },
        }
    }
  }

  private static requireTemplate(
    contentSid: string | undefined,
    reason: string,
  ): string {
    if (!contentSid) {
      throw new Error(
        `WhatsApp template for "${reason}" is not configured yet (pending Content Template Builder + Meta approval)`,
      )
    }
    return contentSid
  }
}
