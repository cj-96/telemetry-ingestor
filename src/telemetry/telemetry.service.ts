import { Injectable, Inject } from '@nestjs/common';
import { Model } from 'mongoose';
import { Redis } from 'ioredis';
import { CreateTelemetryDto } from './dto/create-telemetryRecord.dto';
import { Telemetry } from './interfaces/Telemetry.interface';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class TelemetryService {
  private readonly ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

  constructor(
    @Inject('TELEMETRY_MODEL')
    private readonly telemetryModel: Model<Telemetry>,

    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
  ) {}

  // Save telemetry to MongoDB and update Redis latest
  async save(body: CreateTelemetryDto): Promise<Telemetry> {
    const telemetry: Telemetry = new this.telemetryModel(body);
    const saved = await telemetry.save();

    // Update Redis
    await this.redisClient.set(
      `latest:${saved.deviceId}`,
      JSON.stringify(saved),
    );

    // Check for alerts
    await this.checkAlerts(saved);

    return saved;
  }

  // Check metrics and send alert if thresholds exceeded
  private async checkAlerts(telemetry: Telemetry) {
    const alerts: Array<{
      deviceId: string;
      siteId: string;
      ts: Date;
      reason: string;
      value: number;
    }> = [];

    if (telemetry.metrics.temperature > 50) {
      alerts.push({
        deviceId: telemetry.deviceId,
        siteId: telemetry.siteId,
        ts: telemetry.ts,
        reason: 'HIGH_TEMPERATURE',
        value: telemetry.metrics.temperature,
      });
    }

    if (telemetry.metrics.humidity > 90) {
      alerts.push({
        deviceId: telemetry.deviceId,
        siteId: telemetry.siteId,
        ts: telemetry.ts,
        reason: 'HIGH_HUMIDITY',
        value: telemetry.metrics.humidity,
      });
    }

    for (const alert of alerts) {
      if (
        typeof this.ALERT_WEBHOOK_URL === 'string' &&
        this.ALERT_WEBHOOK_URL.length > 0
      ) {
        try {
          await axios.post(this.ALERT_WEBHOOK_URL, alert, {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.error('Failed to send alert webhook:', error.message);
          } else {
            console.error('Failed to send alert webhook:', error);
          }
        }
      } else {
        console.error('ALERT_WEBHOOK_URL is not defined or not a string.');
      }
    }
  }

  // Get latest telemetry by device
  async getLatestByDevice(deviceId: string): Promise<Telemetry | null> {
    const cached = await this.redisClient.get(`latest:${deviceId}`);
    if (cached) return JSON.parse(cached) as Telemetry;

    const latest = await this.telemetryModel
      .findOne({ deviceId })
      .sort({ ts: -1 })
      .exec();

    if (latest) {
      await this.redisClient.set(`latest:${deviceId}`, JSON.stringify(latest));
    }

    return latest;
  }

  // Aggregate telemetry summary for a site
  async getSiteSummary(
    siteId: string,
    from: string,
    to: string,
  ): Promise<{
    count: number;
    avgTemperature: number;
    maxTemperature: number;
    avgHumidity: number;
    maxHumidity: number;
    uniqueDevices: number;
  } | null> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    type SiteSummary = {
      count: number;
      avgTemperature: number;
      maxTemperature: number;
      avgHumidity: number;
      maxHumidity: number;
      uniqueDevices: number;
    };

    const result: SiteSummary[] = await this.telemetryModel.aggregate([
      {
        $match: { siteId, ts: { $gte: fromDate, $lte: toDate } },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgTemperature: { $avg: '$metrics.temperature' },
          maxTemperature: { $max: '$metrics.temperature' },
          avgHumidity: { $avg: '$metrics.humidity' },
          maxHumidity: { $max: '$metrics.humidity' },
          uniqueDevices: { $addToSet: '$deviceId' },
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

    return result.length > 0 ? result[0] : null;
  }
}
