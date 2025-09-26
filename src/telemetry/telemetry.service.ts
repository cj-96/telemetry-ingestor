import {
  Inject,
  Injectable,
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
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<TelemetryDocument>,

    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,

    @Inject(PinoLogger)
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TelemetryService.name);
  }

  /**
   * Insert telemetry record(s) into DB.
   * - Handles both single and batch input
   * - Refreshes latest cache (non-blocking)
   * - Triggers alerts (non-blocking)
   */
  async create(
    dto: CreateTelemetryDto | CreateTelemetryDto[],
  ): Promise<Telemetry | Telemetry[]> {
    try {
      const dtos = (Array.isArray(dto) ? dto : [dto]).map((d) => ({
        ...d,
        ts: new Date(d.ts), // Ensure ts is a Date
      }));

      const saved = await this.telemetryModel.insertMany(dtos);

      // Non-blocking cache + alerts
      void this.cacheLatest(saved);
      for (const telemetry of saved) {
        void this.evaluateAlerts(telemetry);
      }

      return Array.isArray(dto) ? saved : saved[0];
    } catch (error: unknown) {
      this.logger.error({
        event: 'create_failed',
        dtoCount: Array.isArray(dto) ? dto.length : 1,
        deviceIds: Array.isArray(dto)
          ? dto.map((d) => d.deviceId)
          : [dto.deviceId],
        reason: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new InternalServerErrorException(
        'Failed to create telemetry record(s)',
      );
    }
  }

  /**
   * Cache the latest telemetry per device (only if newer than cached value).
   * Logs warnings if cache operation fails.
   */
  async cacheLatest(saved: Telemetry[]): Promise<void> {
    await Promise.all(
      saved.map((t) =>
        this.cacheManager
          .get<Telemetry>(`latestTelemetry:${t.deviceId}`)
          .then((existing) => {
            if (!existing || new Date(t.ts) > new Date(existing.ts)) {
              return this.cacheManager.set(`latestTelemetry:${t.deviceId}`, t);
            }
          })
          .catch((err: unknown) => {
            this.logger.warn({
              event: 'cache_failed',
              deviceId: t.deviceId,
              siteId: t.siteId,
              ts: t.ts,
              reason: err instanceof Error ? err.message : String(err),
              err, // keep raw error for debugging
            });
          }),
      ),
    );
  }

  /**
   * Retrieve latest telemetry for a given device.
   * - First tries cache, falls back to DB if cache miss
   * - Logs hits/misses, errors
   */
  async getLatest(deviceId: string): Promise<Telemetry> {
    try {
      const cached = await this.cacheManager.get<Telemetry>(
        `latestTelemetry:${deviceId}`,
      );
      if (cached) {
        this.logger.info({
          event: 'cache_hit',
          deviceId,
          message: 'Cache hit for latest telemetry',
        });
        return cached;
      }

      this.logger.info({
        event: 'cache_miss',
        deviceId,
        message: 'Cache miss, querying DB',
      });

      const telemetryFromDb = await this.telemetryModel
        .findOne({ deviceId })
        .sort({ ts: -1 })
        .lean()
        .exec();

      if (!telemetryFromDb) {
        throw new NotFoundException('No telemetry data found');
      }

      return telemetryFromDb;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;

      this.logger.error({
        event: 'get_latest_failed',
        deviceId,
        reason: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new InternalServerErrorException(
        'Failed to retrieve latest telemetry',
      );
    }
  }

  /**
   * Generate aggregated telemetry summary for a site.
   * - Counts entries, unique devices, avg/max metrics
   */
  async getTelemetrySummary(
    siteId: string,
    from?: string,
    to?: string,
  ): Promise<SummaryResult> {
    try {
      const match: FilterQuery<TelemetryDocument> = { siteId };
      if (from && to) {
        match.ts = { $gte: new Date(from), $lte: new Date(to) };
      }

      const result = await this.telemetryModel.aggregate<SummaryResult>([
        { $match: match },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            uniqueDevices: { $addToSet: '$deviceId' },
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
            uniqueDevices: { $size: '$uniqueDevices' },
          },
        },
      ]);

      if (!result[0]) {
        this.logger.info({
          event: 'summary_no_data',
          siteId,
          from,
          to,
          message: 'No telemetry data found for the range',
        });
        return {
          count: 0,
          avgTemperature: 0,
          maxTemperature: 0,
          avgHumidity: 0,
          maxHumidity: 0,
          uniqueDevices: 0,
        };
      }

      this.logger.info({
        event: 'summary_generated',
        siteId,
        from,
        to,
        ...result[0],
        message: 'Generated telemetry summary',
      });
      return result[0];
    } catch (error: unknown) {
      this.logger.error({
        event: 'summary_failed',
        siteId,
        from,
        to,
        reason: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new InternalServerErrorException(
        'Failed to retrieve telemetry summary',
      );
    }
  }

  /**
   * Evaluate telemetry against alerting rules.
   * - High temp > 50
   * - High humidity > 90
   */
  private evaluateAlerts(telemetry: Telemetry) {
    const alerts: any[] = [];

    if (telemetry.metrics.temperature > 50) {
      alerts.push({
        deviceId: telemetry.deviceId,
        siteId: telemetry.siteId,
        ts: telemetry.ts,
        reason: 'High Temperature',
        value: telemetry.metrics.temperature,
      });
    }

    if (telemetry.metrics.humidity > 90) {
      alerts.push({
        deviceId: telemetry.deviceId,
        siteId: telemetry.siteId,
        ts: telemetry.ts,
        reason: 'High Humidity',
        value: telemetry.metrics.humidity,
      });
    }

    for (const alert of alerts) {
      void this.sendAlert(alert); // fire and forget
    }
  }

  /**
   * Send alert via webhook (if configured).
   * Logs failures with error level.
   */

  async sendAlert(alert: Record<string, any>) {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return;

    try {
      await axios.post(url, alert, { timeout: 5000 });

      this.logger.info(
        {
          event: 'alert_sent',
          payload: alert,
          service: 'alert-service',
          timestamp: new Date().toISOString(),
        },
        'Alert sent successfully',
      );
    } catch (err: unknown) {
      let msg: string;
      if (axios.isAxiosError(err)) {
        msg = err.code === 'ECONNABORTED' ? 'Request timed out' : err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      } else {
        msg = 'unknown error';
      }

      this.logger.error(
        {
          event: 'alert_failed',
          payload: alert,
          service: 'alert-service',
          error: msg,
          timestamp: new Date().toISOString(),
        },
        'Failed to send alert',
      );

      // Optional: enqueue for retry (BullMQ, Kafka, etc.)
    }
  }
}
