import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource } from 'typeorm-transactional'
import { ConfigModule } from './shared/config/config.module'
import { ConfigService } from './shared/config/service'
import { MessagingModule } from './shared/broker/sqs.module'
import { WalletModule } from './wallet/wallet.module'
import { SettleModule } from './settle/settle.module'
import { CampaignModule } from './campaign/campaign.module'
import { PayoutModule } from './payout/payout.module'
import { ClaimModule } from './claim/claim.module'
import { IdentityModule } from './identity/identity.module'

@Module({
  imports: [
    ConfigModule.forRoot(),
    // Registro único e global do SqsModule — ver o comentário em
    // shared/broker/sqs.module.ts sobre por que isso NÃO pode ser espalhado
    // por módulo de domínio.
    MessagingModule,
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
        return Promise.resolve(
          addTransactionalDataSource(new DataSource(options)),
        )
      },
    }),
    WalletModule,
    SettleModule,
    CampaignModule,
    PayoutModule,
    ClaimModule,
    IdentityModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
