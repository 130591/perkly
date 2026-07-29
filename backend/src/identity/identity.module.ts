import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { AuthGuard, PassportModule } from '@nestjs/passport'
import { Authentication } from './controller'
import { Service } from './service'
import { IdentityClient } from './client'
import { BackofficeGuard } from './backoffice.guard'
import { JwtStrategy } from './jwt.strategy'
import { ConfigService } from '../shared/config/service'
import {
  Repository,
  UserRepository,
  UserActivationRepository,
  RefreshTokenRepository,
  TenantInvitationRepository,
  PasswordResetRepository,
} from './database'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwt = config.get('jwt')
        return {
          secret: jwt.secret,
          signOptions: { expiresIn: jwt.accessTokenTtlSeconds },
        }
      },
    }),
  ],
  controllers: [Authentication],
  providers: [
    Service,
    IdentityClient,
    BackofficeGuard,
    JwtStrategy,
    // RFC 0005, Decisão 1 — opt-out: toda rota exige token por padrão.
    // (task 02 introduz @Public() pra abrir exceção; até lá, nada escapa.)
    { provide: APP_GUARD, useClass: AuthGuard('jwt') },
    Repository,
    UserRepository,
    UserActivationRepository,
    RefreshTokenRepository,
    TenantInvitationRepository,
    PasswordResetRepository,
  ],
  // Única porta que outros módulos podem importar (RFC 0004, Decisão 3).
  exports: [IdentityClient],
})
export class IdentityModule {}
