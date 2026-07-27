import { Module } from '@nestjs/common'
import { Authentication } from './controller'
import { Service } from './service'
import { BackofficeGuard } from './backoffice.guard'
import { Repository, UserRepository, UserActivationRepository } from './database'

@Module({
  imports: [],
  controllers: [Authentication],
  providers: [Service, BackofficeGuard, Repository, UserRepository, UserActivationRepository],
})
export class IdentityModule {}
