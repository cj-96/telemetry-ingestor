import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from '@songkeys/nestjs-redis-health';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  private readonly redis: Redis;
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    });
  }

  @Get('mongo')
  @HealthCheck()
  checkMongo(): Promise<HealthCheckResult> {
    return this.health.check([async () => this.mongoose.pingCheck('mongoose')]);
  }

  @Get('redis')
  @HealthCheck()
  async checkRedis(): Promise<HealthCheckResult> {
    return await this.health.check([
      () =>
        this.redisIndicator.checkHealth('redis', {
          type: 'redis',
          client: this.redis,
          timeout: 100,
        }),
    ]);
  }
}
