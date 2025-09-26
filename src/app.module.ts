import { Module } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { MongooseModule } from '@nestjs/mongoose';
import { env } from 'process';
import { TelemetryModule } from './telemetry/telemetry.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DeviceThrottlerGuard } from './guards/device-throttle.guard';
import { HealthModule } from './health/health.module';
import * as redisStore from 'cache-manager-redis-store';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

dotenv.config();

const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  keyPrefix: 'throttler:',
};

@Module({
  imports: [
    HealthModule,
    TelemetryModule,
    MongooseModule.forRoot(env.MONGO_URI || ''),
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
      isGlobal: true,
      limit: 1000,
      ttl: 600000,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60 * 1000, // TTL in ms (may need to check your version units)
          limit: 10,
          // optionally name, blockDuration, etc.
        },
      ],
      storage: new ThrottlerStorageRedisService(redisConfig),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true, // 🎨 colors
                  translateTime: 'SYS:standard', // ⏱ human time
                  singleLine: false, // pretty multiline logs
                },
              }
            : undefined, // 🚀 in prod, log pure JSON
      },
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DeviceThrottlerGuard,
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
