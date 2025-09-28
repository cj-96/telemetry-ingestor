import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class EndpointParamsValidationGuard implements CanActivate {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(EndpointParamsValidationGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract and normalize params/query values to strings
    const siteId =
      typeof request.params.siteId === 'string'
        ? request.params.siteId
        : undefined;
    const deviceId =
      typeof request.params.deviceId === 'string'
        ? request.params.deviceId
        : undefined;
    const from =
      typeof request.query.from === 'string' ? request.query.from : undefined;
    const to =
      typeof request.query.to === 'string' ? request.query.to : undefined;

    // Validation patterns
    const devIdPattern = /^dev-\d+$/;
    const siteIdPattern = /^site-[A-Z]$/;
    const isISODate = (str: string) => !isNaN(Date.parse(str));
    const isFromBeforeTo = (from: string, to: string) =>
      new Date(from).getTime() <= new Date(to).getTime();

    try {
      // Validate siteId if present
      if (siteId) {
        if (!siteIdPattern.test(siteId)) {
          this.logger.warn(
            { siteId, action: 'validateParams' },
            'Invalid siteId format',
          );
          throw new BadRequestException('Invalid siteId');
        }

        if (!from || !to || !isISODate(from) || !isISODate(to)) {
          throw new BadRequestException('Dates must be valid ISO timestamps');
        }

        if (!isFromBeforeTo(from, to)) {
          throw new BadRequestException(
            'Starting Date must be before the Ending Date',
          );
        }
      }

      // Validate deviceId if present
      if (deviceId && !devIdPattern.test(deviceId)) {
        throw new BadRequestException('Invalid deviceId');
      }

      // Successful validation
      this.logger.debug(
        { siteId, deviceId, from, to, action: 'validateParams' },
        'Parameters validated successfully',
      );
      return true;
    } catch (err) {
      // Log error with structured context
      this.logger.error(
        { err, siteId, deviceId, from, to, action: 'validateParams' },
        'Parameter validation failed',
      );
      throw err; // re-throw to let Nest handle exception
    }
  }
}
