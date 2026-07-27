import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '../shared/config/service'

// Mesmo padrão do `WebhookGuard` (settle/celcoin) — RFC 0004, Decisão 10.
@Injectable()
export class BackofficeGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const provided = request.headers['x-backoffice-token']
    if (provided !== this.config.get('backoffice').token) {
      throw new UnauthorizedException('Invalid backoffice credentials')
    }
    return true
  }
}
