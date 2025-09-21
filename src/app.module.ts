import { Module } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { MongooseModule } from '@nestjs/mongoose';
import { env } from 'process';
import { TelemetryModule } from './telemetry/telemetry.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { redisStore } from 'cache-manager-redis-store';

dotenv.config();

const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  keyPrefix: 'throttler:',
};

@Module({
  imports: [
    TelemetryModule,
    MongooseModule.forRoot(env.MONGO_URI || ''),
    CacheModule.register({
      store: redisStore,
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      ttl: 60, // seconds
      max: 100, // max items in cache
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60,
          limit: 10,
        },
      ],
      storage: new ThrottlerStorageRedisService(redisConfig),
    }),
  ],
})
export class AppModule {}
