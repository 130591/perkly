import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource } from 'typeorm-transactional'
import { ConfigModule } from './config/config.module'
import { ConfigService } from './config/service'
import { WalletModule } from './wallet/wallet.module'
import { SettleModule } from './settle/settle.module'
import { CampaignModule } from './campaign/campaign.module'

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get('database')
        return {
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          // Off by default; integration tests flip it on against a throwaway DB.
          synchronize: db.synchronize,
        }
      },
      dataSourceFactory: (options) => {
        if (!options) throw new Error('Invalid TypeORM options')
        return Promise.resolve(addTransactionalDataSource(new DataSource(options)))
      },
    }),
    WalletModule,
    SettleModule,
    CampaignModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
