import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { UserRole } from '../database'
import { AuthenticatedUser } from './jwt.strategy'
import { IS_PUBLIC_KEY } from './public.decorator'
import { ROLES_KEY } from './roles.decorator'

// RFC 0005, Decisão 4 — roda depois do AuthGuard('jwt') (precisa de
// req.user.role já populado).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!roles || roles.length === 0) return true

    // @Public() pula a autenticação (JwtAuthGuard), então req.user nunca é
    // populado nessas rotas — @Roles() combinado com @Public() não faz
    // sentido como "restrição", então trata como liberado em vez de 500.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (isPublic) return true

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>()

    if (!roles.includes(request.user.role)) {
      throw new ForbiddenException('Insufficient role')
    }
    return true
  }
}
