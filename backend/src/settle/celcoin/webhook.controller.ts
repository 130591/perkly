import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { WebhookGuard } from './webhook.guard'
import { CelcoinPixIn, normalizeCashIn } from './webhook.normalizer'
import { CashInConfirmed } from '../rail-events'
import { serializeCashIn } from '../rail-events.codec'
import { CASH_IN_QUEUE } from '../queues'

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
  async pixPaymentIn(@Body() payload: CelcoinPixIn) {
    let event: CashInConfirmed
    try {
      event = normalizeCashIn(payload)
    } catch (error) {
      // Payload inválido/não-confirmado: ACK (200) pra Celcoin PARAR de
      // reentregar, mas NÃO enfileira. Log pra conciliação. (Falha de send,
      // abaixo, é o oposto: deixamos estourar pra Celcoin reentregar.)
      this.logger.warn(`Discarding pix-payment-in: ${(error as Error).message}`)
      return { received: true }
    }

    await this.sqs.send(CASH_IN_QUEUE, {
      id: event.endToEndId,
      body: serializeCashIn(event),
    })
    return { received: true }
  }
}
