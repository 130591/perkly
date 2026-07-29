import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { Public } from '../../identity/public.decorator'
import { WebhookGuard } from './webhook.guard'
import { normalizeCashIn, normalizePayoutConfirmed } from './webhook.normalizer'
import { CashInConfirmed, PayoutConfirmed } from '../rail-events'
import { serializeCashIn, serializePayoutConfirmed } from '../rail-events.codec'
import { CASH_IN_QUEUE, PAYOUT_CONFIRMED_QUEUE } from '../queues'
import { CelcoinWebhookOutSchema, CelcoinWebhookSchema } from './webhook.schema'

/**
 * Recebe os webhooks da Celcoin. Um endpoint POR evento (§2.2): `pix-payment-in`
 * (cash-in) e `pix-payment-out` (cash-out/payout confirmado). Responsabilidade
 * fina — autentica (guard), normaliza (borda), enfileira e responde 200
 * rápido; o efeito (crédito/settle no ledger) roda async no consumidor. Zero
 * regra de negócio aqui.
 */
@Controller('webhooks/celcoin')
@Public()
@UseGuards(WebhookGuard)
export class CelcoinWebhookController {
  private readonly logger = new Logger(CelcoinWebhookController.name)

  constructor(private readonly sqs: SqsService) {}

  @Post('pix-payment-in')
  @HttpCode(200)
  async pixPaymentIn(@Body() payload: unknown) {
    let event: CashInConfirmed
    try {
      const parsed = CelcoinWebhookSchema.parse(payload)
      event = normalizeCashIn(parsed)
    } catch (error) {
      this.logger.warn(`Discarding pix-payment-in: ${(error as Error).message}`)
      return { received: true }
    }

    await this.sqs.send(CASH_IN_QUEUE, {
      id: event.endToEndId,
      body: serializeCashIn(event),
    })

    return { received: true }
  }

  @Post('pix-payment-out')
  @HttpCode(200)
  async pixPaymentOut(@Body() payload: unknown) {
    let event: PayoutConfirmed
    try {
      const parsed = CelcoinWebhookOutSchema.parse(payload)
      event = normalizePayoutConfirmed(parsed)
    } catch (error) {
      this.logger.warn(
        `Discarding pix-payment-out: ${(error as Error).message}`,
      )
      return { received: true }
    }

    await this.sqs.send(PAYOUT_CONFIRMED_QUEUE, {
      id: event.endToEndId,
      body: serializePayoutConfirmed(event),
    })

    return { received: true }
  }
}
