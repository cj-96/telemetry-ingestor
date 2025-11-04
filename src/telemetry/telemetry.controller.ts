import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { Telemetry } from './schemas/telemetry.schema';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { ProducerService } from 'src/kafka/producer/producer.service';
import { Throttle } from '@nestjs/throttler';
import { DeviceThrottlerGuard } from 'src/common/guards/device-throttle.guard';

@Controller()
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    @Inject(PinoLogger)
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly producer: ProducerService,
  ) {}

  @Post('telemetry')
  @HttpCode(202)
  @Version('1')
  @UseGuards(DeviceThrottlerGuard)
  async create(@Body() dto: CreateTelemetryDto | CreateTelemetryDto[]) {
    const topic =
      this.configService.get<string>('KAFKA_INGRESS_TOPIC') ||
      'telemetry-ingress';
    const payloads = Array.isArray(dto) ? dto : [dto];
    try {
      await this.producer.produce({
        topic,
        messages: [
          {
            value: JSON.stringify(payloads),
          },
        ],
      });
      this.logger.info({ count: payloads.length }, 'Telemetry published');
      return { status: 'accepted', count: payloads.length };
    } catch (err) {
      this.logger.error({ err }, 'Failed to publish telemetry');
      throw new HttpException(
        'Telemetry publish failed',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('site/:siteId/summary')
  @Version('1')
  @Throttle({ burst: { ttl: 1000, limit: 3 } })
  async getSummary(
    @Param('siteId') siteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return await this.telemetryService.getTelemetrySummary(siteId, from, to);
  }

  @Get('device/:deviceId/latest')
  @Version('1')
  @Throttle({ burst: { ttl: 1000, limit: 3 } })
  getLatest(@Param('deviceId') deviceId: string): Promise<Telemetry> {
    return this.telemetryService.getLatest(deviceId);
  }
}
