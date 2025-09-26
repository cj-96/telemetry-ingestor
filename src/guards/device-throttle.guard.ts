import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  // eslint-disable-next-line @typescript-eslint/require-await
  protected async getTracker(req: Request): Promise<string> {
    const deviceId = req.headers['device-id'];
    if (!deviceId || typeof deviceId !== 'string') {
      throw new UnauthorizedException('Device ID is required');
    }

    return `device_${deviceId}`;
  }
}
