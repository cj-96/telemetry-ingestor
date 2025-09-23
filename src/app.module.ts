import { Module } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { MongooseModule } from '@nestjs/mongoose';
import { env } from 'process';
import { TelemetryModule } from './telemetry/telemetry.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { createKeyv } from '@keyv/redis';
import { APP_GUARD } from '@nestjs/core';
import { DeviceThrottlerGuard } from './guards/device-throttle.guard';

dotenv.config();

const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  keyPrefix: 'throttler:',
};

@Module({
  imports: [
    TelemetryModule,
    MongooseModule.forRoot(env.MONGO_URI || ''),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        return {
          stores: [
            createKeyv(
              `redis://${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? 6379}`,
            ),
          ],
          ttl: 600000, // default 10 minutes
        };
      },
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DeviceThrottlerGuard,
    },
  ],
})
export class AppModule {}
