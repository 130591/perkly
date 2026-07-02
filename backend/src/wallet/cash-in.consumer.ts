import { Injectable, Logger } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { Message } from '@aws-sdk/client-sqs'
import { Wallet } from './service'
import { parseCashIn } from '../settle/rail-events.codec'
import { CASH_IN_QUEUE } from '../settle/queues'

/**
 * Assina o evento `CashInConfirmed` publicado pelo settle e credita o ledger.
 *
 * Wallet (lógico) reagindo à camada física: o settle publica que o dinheiro
 * entrou de verdade; aqui a gente credita. Wallet depende do settle (evento +
 * codec + fila); o settle não conhece o wallet. Desserializa (codec) e delega —
 * idempotência e regra (lock + fund) vivem no service. Lançar aqui = SQS
 * reentrega (at-least-once) → após maxReceiveCount (5) cai na DLQ.
 */
@Injectable()
export class CashInConsumer {
  private readonly logger = new Logger(CashInConsumer.name)

  constructor(private readonly wallet: Wallet) {}

  @SqsMessageHandler(CASH_IN_QUEUE, false)
  async handle(message: Message): Promise<void> {
    const event = parseCashIn(message.Body ?? '')
    await this.wallet.confirmBalance(event)
    this.logger.log(`Confirmed cash-in ${event.reference} (${event.endToEndId})`)
  }
}
