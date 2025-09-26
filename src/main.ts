import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // 1️⃣ Use Pino logger globally
  app.useLogger(app.get(Logger));

  // 2️⃣ Body parsers first so req.body is available
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));

  // 4️⃣ Global prefix
  app.setGlobalPrefix('api');

  // 5️⃣ Versioning
  app.enableVersioning({ type: VersioningType.URI });

  // 6️⃣ Global pipes (validation, transformation)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error('Failed to bootstrap app', err);
  process.exit(1);
});
