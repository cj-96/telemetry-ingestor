import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { HttpErrorFilter } from './common/filters/http-error.filter';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';
import { RedisExceptionFilter } from './common/filters/redis-exception.filter';
import { AxiosExceptionFilter } from './common/filters/axios-exception.filter';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);

  app.enableVersioning({
    type: VersioningType.URI,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  app.use(bodyParser.json({ limit: '100kb' }));
  app.use(bodyParser.urlencoded({ limit: '100kb', extended: true }));

  app.useGlobalFilters(
    new HttpErrorFilter(),
    new MongoExceptionFilter(),
    new RedisExceptionFilter(),
    new AxiosExceptionFilter(),
    new GlobalExceptionFilter(),
  );
}
bootstrap();
