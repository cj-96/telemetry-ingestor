import { Module } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { MongooseModule } from '@nestjs/mongoose';
import { env } from 'process';
import { TelemetryModule } from './telemetry/telemetry.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';

dotenv.config();

@Module({
  imports: [
    TelemetryModule,
    MongooseModule.forRoot(env.MONGO_URI || ''),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60,
          limit: 10,
        },
      ],
    }),
    CacheModule.register(),
  ],
})
export class AppModule {}
