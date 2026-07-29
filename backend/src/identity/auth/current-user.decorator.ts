import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'
import { AuthenticatedUser } from './jwt.strategy'

// RFC 0005, Decisão 3 — accountId só vem do token, nunca de URL/body/query.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>()
    return request.user
  },
)
