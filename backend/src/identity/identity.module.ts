import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Authentication } from './http/controller'
import {
  TenantProvisioningService,
  SessionService,
  MembershipService,
  PasswordRecoveryService,
} from './service'
import { IdentityClient } from './client'
import { BackofficeGuard, JwtStrategy, JwtAuthGuard, RolesGuard } from './auth'
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
    TenantProvisioningService,
    SessionService,
    MembershipService,
    PasswordRecoveryService,
    IdentityClient,
    BackofficeGuard,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Depois do JwtAuthGuard — precisa de req.user.role já populado.
    { provide: APP_GUARD, useClass: RolesGuard },
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
