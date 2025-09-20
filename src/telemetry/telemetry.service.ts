import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Telemetry } from './schemas/telemetry.schema';
import axios from 'axios';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectModel(Telemetry.name) private telemetryModel: Model<Telemetry>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async create(createTelemetryDto: CreateTelemetryDto): Promise<Telemetry> {
    await this.cacheManager.set('latestTelemetry', createTelemetryDto);
    const CreatedTelemetry = new this.telemetryModel(createTelemetryDto);
    return CreatedTelemetry.save();
  }

  async getLatest(): Promise<Telemetry | null> {
    const cachedTelemetry =
      (await this.cacheManager.get<Telemetry>('latestTelemetry')) ?? null;
    if (cachedTelemetry) {
      return cachedTelemetry;
    }

    const telemetry = await this.telemetryModel
      .findOne()
      .sort({ ts: -1 })
      .exec();
    await this.cacheManager.set('latestTelemetry', telemetry, 60);

    return telemetry;
  }

  async getSummery(): Promise<any> {
    const result = await this.telemetryModel.aggregate([
      {
        $group: {
          _id: null,
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

    return (
      result[0] || {
        count: 0,
        avgTemperature: 0,
        maxTemperature: 0,
        avgHumidity: 0,
        maxHumidity: 0,
        uniqueDevices: 0,
      }
    );
  }

  private async sendAlert(
    deviceId: string,
    siteId: string,
    ts: string,
    reason: string,
    value: number,
  ) {
    const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
    if (!ALERT_WEBHOOK_URL) return;

    try {
      await axios.post(ALERT_WEBHOOK_URL, {
        deviceId,
        siteId,
        ts,
        reason,
        value,
      });
    } catch (error) {
      console.error('Failed to send alert', error);
    }
  }
}
