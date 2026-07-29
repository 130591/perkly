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

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>()

    if (!roles.includes(request.user.role)) {
      throw new ForbiddenException('Insufficient role')
    }
    return true
  }
}
