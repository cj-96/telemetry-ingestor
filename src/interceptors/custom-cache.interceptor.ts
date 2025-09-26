import {
  Injectable,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import {
  CacheInterceptor,
  CACHE_MANAGER,
  CACHE_TTL_METADATA,
} from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
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

  /**
   * Intercepts response:
   * - Writes to cache with route-specific key + TTL
   * - Logs cache set failures (non-blocking)
   */
  override async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheKey = this.trackBy(context);
    if (!cacheKey) return super.intercept(context, next);

    const ttl =
      this.reflector.get<number>(CACHE_TTL_METADATA, context.getHandler()) ??
      60;

    return next.handle().pipe(
      tap((data) => {
        this.cacheManager.set(cacheKey, data, ttl).catch((err) =>
          this.logger.error(
            {
              event: 'cache_set_failed',
              cacheKey,
              reason: (err as Error)?.message,
              stack:
                process.env.NODE_ENV !== 'production'
                  ? (err as Error)?.stack
                  : undefined,
            },
            'Cache set failed',
          ),
        );
      }),
      catchError((err: unknown) => {
        // Pass through service/business errors for global exception filter
        return throwError(() => err);
      }),
    );
  }
}
