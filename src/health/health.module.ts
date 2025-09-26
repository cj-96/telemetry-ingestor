import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisHealthModule } from '@songkeys/nestjs-redis-health';

@Module({
  imports: [TerminusModule, MongooseModule, RedisHealthModule],
  controllers: [HealthController],
})
export class HealthModule {}
