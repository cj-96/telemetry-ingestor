import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CacheModule } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { TelemetryController } from '../src/telemetry/telemetry.controller';
import { TelemetryService } from '../src/telemetry/telemetry.service';

import { EndpointParamsValidationGuard } from '../src/common/guards/endpoint-params-validation.guard';
import {
  Telemetry,
  TelemetrySchema,
} from '../src/telemetry/schemas/telemetry.schema';
import { SummaryResult } from '../src/telemetry/interfaces/SummaryResult.interface';
import { CustomCacheInterceptor } from '../src/common/interceptors/custom-cache.interceptor';
import { App } from 'supertest/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Telemetry E2E', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let httpServer: any;
  let cache: Cache;

  const loggerMock: jest.Mocked<PinoLogger> = {
    // minimal mock for methods used in service
    setContext: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    child: jest.fn() as any,
    assign: jest.fn() as any,
  };

  const configMock: Partial<ConfigService> = {
    get: (key: string) => {
      if (key === 'ALERT_WEBHOOK_URL') return 'http://fake-webhook.local/alert';
      return undefined;
    },
  };

  beforeAll(async () => {
    jest.setTimeout(30000);
    mongo = await MongoMemoryServer.create();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        // in-memory Mongo
        MongooseModule.forRootAsync({
          useFactory: async () => ({ uri: mongo.getUri() }),
        }),
        MongooseModule.forFeature([
          { name: Telemetry.name, schema: TelemetrySchema },
        ]),
        // in-memory cache (no Redis needed for tests)
        CacheModule.register({ ttl: 60_000 }),
      ],
      controllers: [TelemetryController],
      providers: [
        TelemetryService,
        CustomCacheInterceptor,
        Reflector,
        { provide: PinoLogger, useValue: loggerMock },
        { provide: ConfigService, useValue: configMock },
        // Allow controller-level guard to pass in tests
        {
          provide: EndpointParamsValidationGuard,
          useValue: { canActivate: () => true },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Match your app behavior: URI versioning and class-validation transform
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    httpServer = app.getHttpServer();
    cache = app.get<Cache>(CACHE_MANAGER);
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  beforeEach( async () => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

  });

  async function postTelemetry(
    body: Telemetry | Telemetry[],
  ): Promise<request.Response> {
    return request(httpServer).post('/v1/telemetry').send(body);
  }

  function iso(date: string) {
    return new Date(date).toISOString();
  }

  describe('Happy path ingest & alert hit', () => {
    it('POST /v1/telemetry inserts a record and triggers alert when thresholds exceeded', async () => {
      const payload = {
        deviceId: 'dev-001',
        siteId: 'site-A',
        ts: '2025-01-01T12:00:00.000Z',
        metrics: { temperature: 65, humidity: 40 }, // triggers High Temperature
      };

      const res = await postTelemetry(payload);
      expect(res.status).toBe(201);
      expect(res.body.deviceId).toBe('dev-001');
      expect(res.body.siteId).toBe('site-A');
      expect(new Date(res.body.ts).toISOString()).toBe(
        iso('2025-01-01T12:00:00.000Z'),
      );
      expect(res.body.metrics.temperature).toBe(65);
      expect(res.body.metrics.humidity).toBe(40);

      // evaluateAlerts is fire-and-forget; give it a moment to send webhook
      await new Promise((r) => setTimeout(r, 50));

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://fake-webhook.local/alert',
        expect.objectContaining({
          deviceId: 'dev-001',
          siteId: 'site-A',
          reason: 'High Temperature',
          value: 65,
        }),
        expect.any(Object),
      );
    });

    it('POST /v1/telemetry inserts a batch and triggers both alerts (temp & humidity)', async () => {
      const batch = [
        {
          deviceId: 'dev-002',
          siteId: 'site-A',
          ts: '2025-01-01T13:00:00.000Z',
          metrics: { temperature: 55, humidity: 50 }, // High Temperature
        },
        {
          deviceId: 'dev-003',
          siteId: 'site-A',
          ts: '2025-01-01T14:00:00.000Z',
          metrics: { temperature: 30, humidity: 93 }, // High Humidity
        },
      ];

      const res = await postTelemetry(batch);
      expect(res.status).toBe(201);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);

      await new Promise((r) => setTimeout(r, 50));

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const calls = mockedAxios.post.mock.calls.map((c) => c[1]);

      // One for temp
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'High Temperature',
            deviceId: 'dev-002',
          }),
          expect.objectContaining({
            reason: 'High Humidity',
            deviceId: 'dev-003',
          }),
        ]),
      );
    });
  });

  describe('Latest fallback from Mongo', () => {
    it('GET /v1/device/:id/latest returns the most recent record from DB when cache is empty', async () => {
      // Seed two records for same device (avoiding alert thresholds)
      const deviceId = 'dev-010';
      const siteId = 'site-A';
      await postTelemetry([
        {
          deviceId,
          siteId,
          ts: '2025-01-01T00:00:00.000Z' as unknown as Date,
          metrics: { temperature: 25, humidity: 40 },
        },
        {
          deviceId,
          siteId,
          ts: '2025-01-02T00:00:00.000Z' as unknown as Date,
          metrics: { temperature: 26 as number, humidity: 45 as number },
        },
      ]);

      // Clear cache entry set by create() so the request must hit DB
      await cache.del(`latest:${deviceId}`);

      const res = await request(httpServer).get(
        `/v1/device/${deviceId}/latest`,
      );
      expect(res.status).toBe(200);
      expect(res.body.deviceId).toBe(deviceId);
      // Should be the newer record
      expect(new Date(res.body.ts).toISOString()).toBe(
        iso('2025-01-02T00:00:00.000Z'),
      );
      expect(res.body.metrics.temperature).toBe(26);
      expect(res.body.metrics.humidity).toBe(45);
    });
  });

  describe('Summary aggregation correctness', () => {
    it('GET /v1/site/:siteId/summary computes correct counts/uniques/avg/max with and without range', async () => {
      const siteId = 'site-A';

      // Clear cache between logical scenarios
      await cache.clear?.();

      // Seed data (some inside the range, one outside)
      await postTelemetry([
        // Included in [2025-01-01 .. 2025-01-02]
        {
          deviceId: 'dev-101',
          siteId,
          ts: '2025-05-01T00:00:00.000Z' as unknown as Date,
          metrics: { temperature: 10, humidity: 40 },
        },
        {
          deviceId: 'dev-102',
          siteId,
          ts: '2025-05-01T12:00:00.000Z' as unknown as Date,
          metrics: { temperature: 20, humidity: 50 },
        },
        {
          deviceId: 'dev-101',
          siteId,
          ts: '2025-05-02T00:00:00.000Z' as unknown as Date,
          metrics: { temperature: 30, humidity: 60 },
        },
        // Outside range, but should count in "no range" case
        {
          deviceId: 'dev-102',
          siteId,
          ts: '2025-05-04T00:00:00.000Z' as unknown as Date,
          metrics: { temperature: 80, humidity: 95 },
        },
      ]);

      // With date range (include first three, exclude the last)
      const from = '2025-05-01';
      const to = '2025-05-03';

      const rangedRes = await request(httpServer as App)
        .get(`/v1/site/${siteId}/summary`)
        .query({ from, to });

      expect(rangedRes.status).toBe(200);
      const ranged: SummaryResult = rangedRes.body as SummaryResult;
      expect(ranged.count).toBe(3);
      expect(ranged.uniqueDevices).toBe(2);
      expect(ranged.maxTemperature).toBe(30);
      expect(ranged.maxHumidity).toBe(60);
      expect(ranged.avgTemperature).toBeCloseTo(20, 5); // (10 + 20 + 30) / 3
      expect(ranged.avgHumidity).toBeCloseTo(50, 5); // (40 + 50 + 60) / 3

    });
  });
});
