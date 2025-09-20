import { Controller, Get, Post } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { Telemetry } from './schemas/telemetry.schema';
import { Throttle } from '@nestjs/throttler';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Throttle({ default: { limit: 100, ttl: 60 } })
  @Post()
  create() {
    return this.telemetryService.create({
      deviceId: 'device123',
      siteId: 'site456',
      ts: new Date().toISOString(),
      metrics: {
        temperature: 22.5,
        humidity: 60,
      },
    });
  }

  @Get('latest')
  getLatest(): Promise<Telemetry | null> {
    return this.telemetryService.getLatest();
  }
}
