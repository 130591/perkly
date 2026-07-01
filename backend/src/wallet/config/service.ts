import { Injectable } from '@nestjs/common'
import { ConfigService as NestConfigService, Path, PathValue } from '@nestjs/config'
import { SharedConfig } from './shared.config'

/**
 * This service extends the NestConfigService to enforce `WasValidated` to be
 * true (2nd generic argument). Thus, ensuring `get` method return type will
 * always return a value instead of `T | undefined`
 *
 * See
 * - https://docs.nestjs.com/techniques/configuration#using-the-configservice
 * - https://docs.nestjs.com/techniques/configuration#custom-configuration-files
 * - https://github.com/nestjs/config/blob/8f519ac78f9139e0dd4ee26eb97f73344c0237e8/lib/config.service.ts#L34-L35
 */
@Injectable()
export class ConfigService<C = SharedConfig> extends NestConfigService<C, true> {
  override get<P extends Path<C>>(propertyPath: P): PathValue<C, P> {
    return super.get(propertyPath, { infer: true })
  }
}