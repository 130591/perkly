import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource } from 'typeorm-transactional'
import { WalletModule } from './wallet/wallet.module'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'perkly',
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        // Off by default; integration tests flip it on against a throwaway DB.
        synchronize: process.env.DB_SYNCHRONIZE === 'true',
      }),
      // Wrap the DataSource so @Transactional() can hook into it.
      dataSourceFactory: async (options) => {
        if (!options) throw new Error('Invalid TypeORM options')
        return addTransactionalDataSource(new DataSource(options))
      },
    }),
    WalletModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
