import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  private readonly redisHost: string;
  private readonly redisPort: number;

  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly configService: ConfigService,
  ) {
    this.redisHost = this.configService.get<string>('REDIS_HOST')!;
    this.redisPort = this.configService.get<number>('REDIS_PORT')!;
    this.redis = new Redis({
      host: this.redisHost,
      port: this.redisPort,
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
