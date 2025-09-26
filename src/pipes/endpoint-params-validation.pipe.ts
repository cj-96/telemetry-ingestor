import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

// Define expected request parameters
interface EndpointParams {
  siteId?: string;
  deviceId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class EndpointParamsValidationPipe implements PipeTransform {
  transform(value: EndpointParams): EndpointParams {
    const { siteId, deviceId, from, to } = value;

    // Patterns
    const devIdPattern = /^dev-\d+$/; // dev-002
    const siteIdPattern = /^site-[A-Z]$/; // site-A

    // Helpers
    const isISODate = (str: string) => !isNaN(Date.parse(str));
    const isFromBeforeTo = (from: string, to: string) =>
      new Date(from).getTime() <= new Date(to).getTime();

    // --- Summary Endpoint Validation ---
    if (siteId) {
      if (!siteIdPattern.test(siteId)) {
        throw new BadRequestException('Invalid siteId');
      }
      if (!from || !to || !isISODate(from) || !isISODate(to)) {
        throw new BadRequestException('from/to must be valid ISO timestamps');
      }
      if (!isFromBeforeTo(from, to)) {
        throw new BadRequestException('from must be before to');
      }
    }

    // --- Latest Endpoint Validation ---
    if (deviceId && !devIdPattern.test(deviceId)) {
      throw new BadRequestException('Invalid deviceId');
    }

    return value; // All validated, type-safe
  }
}
