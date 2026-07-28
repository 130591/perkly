import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { Authentication } from './controller'
import { Service } from './service'
import { IdentityClient } from './client'
import { BackofficeGuard } from './backoffice.guard'
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
