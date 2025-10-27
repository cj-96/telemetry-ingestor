import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { TelemetryModule } from './telemetry/telemetry.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DeviceThrottlerGuard } from './common/guards/device-throttle.guard';
import { HealthModule } from './health/health.module';
import * as redisStore from 'cache-manager-redis-store';
import { LoggerModule } from 'nestjs-pino';
import { IngestTokenGuard } from './common/guards/ingest-token.guard';
import { AllExceptionFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    HealthModule,
    TelemetryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        // Mongo & Redis
        MONGO_URI: Joi.string().uri().required(),
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().default(6379),

        // Alert webhook & token
        ALERT_WEBHOOK_URL: Joi.string().uri().required(),
        INGEST_TOKEN: Joi.string().required(),

        // Kafka
        KAFKA_BROKERS: Joi.string().required(),
        KAFKA_CLIENT_ID: Joi.string().required(),
        KAFKA_GROUP_ID: Joi.string().required(),
        KAFKA_INGRESS_TOPIC: Joi.string().required(),
        KAFKA_RETRY_TOPIC: Joi.string().required(),
        KAFKA_DLQ_TOPIC: Joi.string().required(),

        // Logging
        LOG_LEVEL: Joi.string()
          .valid('error', 'warn', 'info', 'debug', 'verbose')
          .default('info'),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        limit: 1000,
        ttl: 600000,
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisConfig = {
          url: `redis://${configService.get<string>('REDIS_HOST')}:${configService.get<number>(
            'REDIS_PORT',
          )}`,
          keyPrefix: 'throttler:',
        };

        return {
          throttlers: [
            {
              ttl: 60 * 1000,
              limit: 10,
            },
          ],
          storage: new ThrottlerStorageRedisService(redisConfig),
        };
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              "req.headers['x-api-key']",
            ],
            remove: true,
          },
          transport:
            configService.get<string>('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
        },
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DeviceThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: IngestTokenGuard,
    },
    { provide: APP_FILTER, useClass: AllExceptionFilter },
  ],
})
export class AppModule {}
