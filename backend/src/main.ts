import { NestFactory } from '@nestjs/core'
import { initializeTransactionalContext } from 'typeorm-transactional'
import { AppModule } from './app.module'

async function bootstrap() {
  // Must run before the DataSource is created so @Transactional() can hook it.
  initializeTransactionalContext()
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
