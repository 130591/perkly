import { DynamicModule, Global } from '@nestjs/common'
import {
  ConfigModule as NestConfigModule,
  ConfigModuleOptions as NestConfigModuleOptions,
} from '@nestjs/config'

import { ConfigService } from './service'
import { sharedConfigFactory } from './shared.config'

@Global()
export class ConfigModule {
  static forRoot(options?: NestConfigModuleOptions): DynamicModule {
    return {
      module: ConfigModule,
      imports: [
        NestConfigModule.forRoot({
          ...options,
          expandVariables: true,
          load: options?.load ?? [sharedConfigFactory],
        }),
      ],
      providers: [ConfigService],
      exports: [ConfigService],
    }
  }
}