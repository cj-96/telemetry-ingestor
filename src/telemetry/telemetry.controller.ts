import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { Telemetry } from './schemas/telemetry.schema';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { DeviceThrottlerGuard } from 'src/guards/device-throttle.guard';

@UseGuards(DeviceThrottlerGuard)
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post()
  create(@Body() createTelemetryDto: CreateTelemetryDto) {
    return this.telemetryService.create(createTelemetryDto);
  }

  @Get(':siteId/summary')
  async getSummary(
    @Param('siteId') siteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return await this.telemetryService.getTelemetrySummary(siteId, from, to);
  }

  @Get('latest')
  getLatest(): Promise<Telemetry> {
    return this.telemetryService.getLatest();
  }
}
