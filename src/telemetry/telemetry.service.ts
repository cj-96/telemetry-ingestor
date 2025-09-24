import {
  Inject,
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
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
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<TelemetryDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async create(dto: CreateTelemetryDto): Promise<Telemetry> {
    // Fire-and-forget alerts → don't block ingestion
    if (dto.metrics.temperature > 50) {
      this.sendAlert(
        dto.deviceId,
        dto.siteId,
        dto.ts,
        'High Temperature',
        dto.metrics.temperature,
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Temperature alert failed: ${message}`);
      });
    }

    if (dto.metrics.humidity > 90) {
      this.sendAlert(
        dto.deviceId,
        dto.siteId,
        dto.ts,
        'High Humidity',
        dto.metrics.humidity,
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Humidity alert failed: ${message}`);
      });
    }

    try {
      const created = new this.telemetryModel(dto);
      const saved = await created.save();

      this.logger.log(
        `Stored telemetry: deviceId=${dto.deviceId}, siteId=${dto.siteId}, ts=${dto.ts}`,
      );

      // Cache latest telemetry per device - don't fail if cache fails
      this.cacheManager
        .set(`latestTelemetry:${dto.deviceId}`, saved)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Cache failed: ${message}`);
        });

      return saved;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to store telemetry: ${message}`);
      throw new InternalServerErrorException('Failed to store telemetry');
    }
  }

  async getLatest(deviceId: string): Promise<Telemetry> {
    try {
      const cached = await this.cacheManager.get<Telemetry>(
        `latestTelemetry:${deviceId}`,
      );
      if (cached) {
        this.logger.log('Cache hit for latest telemetry');
        return cached;
      }

      this.logger.log('Cache miss for latest telemetry, querying database');
      const telemetryFromDb = await this.telemetryModel
        .findOne({ deviceId })
        .sort({ ts: -1 })
        .lean()
        .exec();

      if (!telemetryFromDb) {
        throw new NotFoundException('No telemetry data found');
      }

      // Cache the result - don't fail if cache fails
      this.cacheManager
        .set(`latestTelemetry:${telemetryFromDb.deviceId}`, telemetryFromDb)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to cache latest telemetry: ${message}`);
        });

      return telemetryFromDb;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error; // Re-throw NotFoundException as-is
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get latest telemetry: ${message}`);
      throw new InternalServerErrorException(
        'Failed to retrieve latest telemetry',
      );
    }
  }

  async getTelemetrySummary(
    siteId: string,
    from?: string,
    to?: string,
  ): Promise<SummaryResult> {
    const cacheKey = `telemetry-summary:${siteId}:${from || 'start'}:${to || 'end'}`;
    try {
      const cached = await this.cacheManager.get<SummaryResult>(cacheKey);

      if (cached) {
        this.logger.log('Cache hit for telemetry summary.');
        return cached;
      }

      const match: FilterQuery<TelemetryDocument> = { siteId };

      if (from && to) {
        match.ts = {
          $gte: new Date(from),
          $lte: new Date(to),
        };
      }

      const result = await this.telemetryModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            count: { $sum: 1 }, // total telemetry entries
            uniqueDevices: { $addToSet: '$deviceId' }, // collect unique deviceIds
            avgTemperature: { $avg: '$metrics.temperature' },
            maxTemperature: { $max: '$metrics.temperature' },
            avgHumidity: { $avg: '$metrics.humidity' },
            maxHumidity: { $max: '$metrics.humidity' },
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
            uniqueDevices: { $size: '$uniqueDevices' }, // convert set to count
          },
        },
      ]);

      // Return default if no data
      if (!result[0]) {
        return {
          count: 0,
          avgTemperature: 0,
          maxTemperature: 0,
          avgHumidity: 0,
          maxHumidity: 0,
          uniqueDevices: 0,
        };
      }
      this.logger.log(`Generated summary for siteId=${siteId}`);

      // Cache the result - don't fail if cache fails
      this.cacheManager.set(cacheKey, result[0]).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to cache telemetry summary: ${message}`);
      });

      return result[0] as SummaryResult;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get telemetry summary: ${message}`);
      throw new InternalServerErrorException(
        'Failed to retrieve telemetry summary',
      );
    }
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
