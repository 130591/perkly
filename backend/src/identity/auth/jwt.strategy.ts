import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '../../shared/config/service'
import { UserRole } from '../database'

export type AuthenticatedUser = {
  userId: string
  accountId: string
  role: UserRole
}

type AccessTokenPayload = {
  sub: string
  accountId: string
  role: UserRole
}

// RFC 0005, Decisão 2 — checklist OWASP: algoritmo fixado, sem cookie, sem
// checagem de revogação (TTL curto + step-up já cobrem isso, RFC 0004
// Decisão 4). Mensagem genérica de falha é responsabilidade do AuthGuard.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('jwt').secret,
      algorithms: ['HS256'],
    })
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      accountId: payload.accountId,
      role: payload.role,
    }
  }
}
