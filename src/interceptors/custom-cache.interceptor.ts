import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { CacheInterceptor, CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PinoLogger } from 'nestjs-pino';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

@Injectable()
export class CustomCacheInterceptor extends CacheInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) protected readonly cacheManager: Cache,
    private readonly logger: PinoLogger,
    protected readonly reflector: Reflector,
  ) {
    super(cacheManager, reflector);
    this.logger.setContext(CustomCacheInterceptor.name);
  }

  /**
   * Generate cache key for GET requests.
   * - Site summary: "summary:{siteId}:{from}:{to}"
   * - Device latest: "latest:{deviceId}"
   * - Falls back to default CacheInterceptor keying.
   */
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method !== 'GET') return undefined;

    const routePath = request.path;

    this.logger.info('Cache key generated');

    // Site summary endpoint
    if (routePath.includes('site') && routePath.includes('summary')) {
      const siteId = encodeURIComponent(request.params.siteId || '');
      const from = encodeURIComponent((request.query.from as string) || '');
      const to = encodeURIComponent((request.query.to as string) || '');
      return `summary:${siteId}:${from}:${to}`;
    }

    // Device latest endpoint
    if (routePath.includes('device') && routePath.includes('latest')) {
      const deviceId = encodeURIComponent(request.params.deviceId || '');
      return `latest:${deviceId}`;
    }

    // Fallback to default key strategy
    return super.trackBy(context);
  }
}
