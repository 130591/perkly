import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '../../config/service'

/**
 * WebhookGuard — decide só "passa ou 401", nada mais.
 *
 * Placeholder: compara um header contra `WEBHOOK_SECRET`. A Celcoin real usa
 * BASIC AUTH no cadastro do webhook (§6) — quando a credencial chegar, muda SÓ
 * aqui. "Verificar que é a Celcoin" e "entender o que ela disse" (o normalizer)
 * são responsabilidades ortogonais, giram em eixos separados de propósito.
 */
@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const provided = request.headers['x-webhook-secret']
    if (provided !== this.config.get('webhook').secret) {
      throw new UnauthorizedException('Invalid webhook credentials')
    }
    return true
  }
}
