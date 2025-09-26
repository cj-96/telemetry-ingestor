import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';

interface DeviceRequest {
  headers: {
    'device-id'?: string;
    [key: string]: any; // Other headers
  };
}

@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(PinoLogger) private readonly logger: PinoLogger,
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorageService,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
    this.logger.setContext(DeviceThrottlerGuard.name);
  }

  /**
   * Extracts a unique tracker key for throttling based on device ID.
   * Throws UnauthorizedException if device ID is missing.
   * @param req - Incoming request object
   * @returns Unique tracker key string
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  protected async getTracker(req: DeviceRequest): Promise<string> {
    const deviceId = req.headers?.['device-id'];

    if (!deviceId) {
      // Structured warning log for missing device ID
      this.logger.warn(
        { headers: req.headers, action: 'getTracker' },
        'Device ID missing in request headers',
      );
      throw new UnauthorizedException('Device ID is required');
    }

    // Structured debug log for extracted device ID
    this.logger.debug(
      { deviceId, action: 'getTracker' },
      'Using tracker key for throttling',
    );

    return `device_${deviceId}`;
  }
}
