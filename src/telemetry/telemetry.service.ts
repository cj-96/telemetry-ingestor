import {
  Inject,
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Telemetry, TelemetryDocument } from './schemas/telemetry.schema';
import axios from 'axios';
import { SummaryResult } from './interfaces/SummaryResult.interface';
import { AxiosError } from 'axios';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectModel(Telemetry.name) private telemetryModel: Model<Telemetry>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async create(dto: CreateTelemetryDto): Promise<Telemetry> {
    // Fire-and-forget alerts → don’t block ingestion
    if (dto.metrics.temperature > 50) {
      this.sendAlert(
        dto.deviceId,
        dto.siteId,
        dto.ts,
        'High Temperature',
        dto.metrics.temperature,
      ).catch((err: Error) =>
        this.logger.error(`Alert failed: ${err.message}`),
      );
    }
    if (dto.metrics.humidity > 90) {
      this.sendAlert(
        dto.deviceId,
        dto.siteId,
        dto.ts,
        'High Humidity',
        dto.metrics.humidity,
      ).catch((err: Error) =>
        this.logger.error(`Alert failed: ${err.message}`),
      );
    }

    // Cache latest telemetry per device
    await this.cacheManager.set('latestTelemetry', dto);

    try {
      const created = new this.telemetryModel(dto);
      return await created.save();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err: unknown) {
      throw new InternalServerErrorException('Failed to store telemetry');
    }
  }

  async getLatest(): Promise<Telemetry> {
    const cached = await this.cacheManager.get<Telemetry>('latestTelemetry');
    if (cached) {
      this.logger.log('Cache hit for latest telemetry.');
      return cached;
    }

    this.logger.log('Cache miss for latest telemetry, querying database.');
    const telemetryFromDb = await this.telemetryModel
      .findOne()
      .sort({ ts: -1 })
      .lean()
      .exec();

    if (!telemetryFromDb) {
      throw new InternalServerErrorException('No telemetry data found');
    }

    await this.cacheManager.set('latestTelemetry', telemetryFromDb);
    return telemetryFromDb;
  }

  async getSummary(
    siteId: string,
    from?: string,
    to?: string,
  ): Promise<SummaryResult> {
    const cached = await this.cacheManager.get<SummaryResult>(
      `summaryTelemetry:${siteId}`,
    );
    if (cached) {
      this.logger.log('Cache hit for summary telemetry.');
      return cached;
    }

    const match: FilterQuery<TelemetryDocument> = { siteId };
    if (from || to) {
      const tsFilter: Record<string, Date> = {};
      if (from) tsFilter.$gte = new Date(from);
      if (to) tsFilter.$lt = new Date(to);
      match.ts = tsFilter;
    }

    const result = await this.telemetryModel.aggregate<SummaryResult>([
      { $match: match },
      {
        $group: {
          _id: siteId,
          count: { $sum: 1 },
          avgTemperature: { $avg: '$metrics.temperature' },
          maxTemperature: { $max: '$metrics.temperature' },
          avgHumidity: { $avg: '$metrics.humidity' },
          maxHumidity: { $max: '$metrics.humidity' },
          devices: { $addToSet: '$deviceId' },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          avgTemperature: 1,
          maxTemperature: 1,
          avgHumidity: 1,
          maxHumidity: 1,
          uniqueDevices: { $size: '$devices' },
        },
      },
    ]);

    const summary = result[0] || {
      count: 0,
      avgTemperature: 0,
      maxTemperature: 0,
      avgHumidity: 0,
      maxHumidity: 0,
      uniqueDevices: 0,
    };

    await this.cacheManager.set(`summaryTelemetry:${siteId}`, summary);
    return summary;
  }

  private async sendAlert(
    deviceId: string,
    siteId: string,
    ts: string,
    reason: string,
    value: number,
  ) {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return;

    try {
      await axios.post(url, { deviceId, siteId, ts, reason, value });
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        this.logger.error(`Failed to send alert: ${err.message}`);
      } else if (err instanceof Error) {
        this.logger.error(`Failed to send alert: ${err.message}`);
      } else {
        this.logger.error(`Failed to send alert: unknown error`);
      }
    }
  }
}
