import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common'
import { ClaimService } from '../service'
import { ConfigService } from '../../config/service'

/** Intervalo da varredura. Mesmo valor do fan-out de campanha (RFC 0002). */
const SCAN_INTERVAL_MS = 15_000

/**
 * Expira claims vencidos por VARREDURA de estado durável, mesmo padrão do
 * `CampaignFanoutWorker` (RFC 0002): em vez de agendar um timer por claim (que
 * se perde num restart), varre `status='pending' AND expires_at <= now()`. Um
 * claim que passou do prazo é garantidamente pego na próxima varredura, crash
 * ou não — `expire()` + publicação de `ClaimExpired` rodam na mesma transação
 * em `ClaimService.expireNext`.
 */
@Injectable()
export class ClaimExpirationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ClaimExpirationWorker.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly claim: ClaimService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Em `test` não ligamos o loop — mesmo motivo do CampaignFanoutWorker: o
    // harness boota o AppModule inteiro e um scanner de fundo puxaria
    // trabalho. Exercido por teste dedicado chamando `drain()` à mão.
    if (this.config.get('env') === 'test') return
    this.timer = setInterval(() => void this.tick(), SCAN_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.drain()
    } catch (error) {
      this.logger.error(
        `Claim expiration scan failed: ${(error as Error).message}`,
      )
    } finally {
      this.running = false
    }
  }

  /** Expira claims vencidos, um por transação, até esvaziar. */
  async drain(): Promise<void> {
    while (await this.claim.expireNext()) {
      // segue até `expireNext` não achar mais trabalho
    }
  }
}
