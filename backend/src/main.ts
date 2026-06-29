import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { initializeTransactionalContext } from 'typeorm-transactional'
import { AppModule } from './app.module'

async function bootstrap() {
  // Must run before the DataSource is created so @Transactional() can hook it.
  initializeTransactionalContext()
  const app = await NestFactory.create(AppModule)
  // Validate request DTOs and strip unknown properties off the payload.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
