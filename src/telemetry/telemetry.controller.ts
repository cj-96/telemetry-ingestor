import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { CreateTelemetryDto } from './dto/create-telemetryRecord.dto';
import { Telemetry } from './interfaces/Telemetry.interface';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('telemetry')
  async createTelemetry(
    @Body() body: CreateTelemetryDto,
  ): Promise<{ success: boolean; data: Telemetry }> {
    const result: Telemetry = await this.telemetryService.save(body);
    return { success: true, data: result };
  }

  @Get('devices/:deviceId/latest')
  async getLatestByDevice(@Param('deviceId') deviceId: string) {
    const data = await this.telemetryService.getLatestByDevice(deviceId);
    if (!data) {
      throw new HttpException('Device not found', HttpStatus.NOT_FOUND);
    }
    return data;
  }

  @Get('sites/:siteId/summary')
  async getSiteSummary(
    @Param('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<{
    count: number;
    avgTemperature: number;
    maxTemperature: number;
    avgHumidity: number;
    maxHumidity: number;
    uniqueDevices: number;
  }> {
    if (!from || !to) {
      throw new HttpException(
        'from and to query parameters are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const summary = await this.telemetryService.getSiteSummary(
      siteId,
      from,
      to,
    );

    if (!summary) {
      throw new HttpException('Site summary not found', HttpStatus.NOT_FOUND);
    }

    return summary;
  }
}
