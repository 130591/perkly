import { Module } from '@nestjs/common'
import { ClaimController } from './claim.controller'
import { ClaimService } from './service'
import { ClaimRepository } from './database/repository'
import { CreateClaimConsumer } from './messaging/create-claim.consumer'
import { ClaimExpirationWorker } from './messaging/expiration.worker'
import { ClaimEventPublisher } from './messaging/events'
import { SqsClaimEventPublisher } from './messaging/event-publisher'

/**
 * Consome `payout-created` (produzida pelo payout) e gera o link de resgate.
 * Publica `ClaimConfirmed`/`ClaimExpired` nas filas reais via
 * `SqsClaimEventPublisher`. Em `test` não ligamos o poller nem o worker de
 * expiração; ambos são exercidos por teste dedicado chamando `drain()`/
 * `handle()` direto. `SqsService` vem do registro único e global em
 * `shared/broker/sqs.module.ts` (ver o comentário lá — registrar `SqsModule` aqui
 * de novo quebraria isso).
 */
@Module({
  controllers: [ClaimController],
  providers: [
    ClaimService,
    ClaimRepository,
    CreateClaimConsumer,
    ClaimExpirationWorker,
    { provide: ClaimEventPublisher, useClass: SqsClaimEventPublisher },
  ],
})
export class ClaimModule {}
