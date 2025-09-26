import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors,
  UsePipes,
  Version,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { Telemetry } from './schemas/telemetry.schema';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { CustomCacheInterceptor } from 'src/interceptors/custom-cache.interceptor';
import { EndpointParamsValidationPipe } from 'src/pipes/endpoint-params-validation.pipe';

@Controller()
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('telemetry')
  @Version('1')
  create(
    @Body() createTelemetryDto: CreateTelemetryDto | CreateTelemetryDto[],
  ) {
    return this.telemetryService.create(createTelemetryDto);
  }

  @Get('site/:siteId/summary')
  @UsePipes(EndpointParamsValidationPipe)
  @UseInterceptors(CustomCacheInterceptor)
  @CacheTTL(60) // Cache for 30 seconds
  @Version('1')
  async getSummary(
    @Param('siteId') siteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return await this.telemetryService.getTelemetrySummary(siteId, from, to);
  }

  @Get('device/:deviceId/latest')
  @UsePipes(EndpointParamsValidationPipe)
  @UseInterceptors(CustomCacheInterceptor)
  @CacheTTL(60) // Cache for 30 seconds
  @Version('1')
  getLatest(@Param('deviceId') deviceId: string): Promise<Telemetry> {
    return this.telemetryService.getLatest(deviceId);
  }
}
