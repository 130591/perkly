import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { WebhookGuard } from './webhook.guard'
import { normalizeCashIn } from './webhook.normalizer'
import { CashInConfirmed } from '../rail-events'
import { serializeCashIn } from '../rail-events.codec'
import { CASH_IN_QUEUE } from '../queues'
import { CelcoinWebhookSchema } from './webhook.schema'

/**
 * Recebe os webhooks da Celcoin. Um endpoint POR evento (§2.2): hoje só
 * `pix-payment-in` (cash-in). Responsabilidade fina — autentica (guard),
 * normaliza (borda), enfileira e responde 200 rápido; o crédito no ledger roda
 * async no consumidor (passo 3.2). Zero regra de negócio aqui.
 */
@Controller('webhooks/celcoin')
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
      this.logger.warn(
       `Discarding pix-payment-in: ${(error as Error).message}`,
      )
      return { received: true }
     }

    await this.sqs.send(CASH_IN_QUEUE, {
      id: event.endToEndId,
      body: serializeCashIn(event),
    })

    return { received: true }
  }
}
