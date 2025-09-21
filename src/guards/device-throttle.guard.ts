import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
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

    return Promise.resolve(`device_${deviceId}`);
  }

  protected getLimit(context: ExecutionContext): number {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const deviceId = request.headers['device-id'];

    if (!deviceId) {
      throw new UnauthorizedException('Device ID is required');
    }

    return 5; // Rate limit for authorized devices
  }

  protected getTTL(): number {
    return 60; // 60 seconds window
  }
}
