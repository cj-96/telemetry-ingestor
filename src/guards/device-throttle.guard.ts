import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

interface DeviceRequest extends Request {
  headers: {
    'device-id': string;
  } & Request['headers'];
}

@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: DeviceRequest): Promise<string> {
    const deviceId = req.headers['device-id'];
    if (!deviceId) {
      throw new UnauthorizedException('Device ID is required');
    }
    return `device_${deviceId}`;
  }
}
