import { CacheInterceptor } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { Cache } from 'cache-manager';
import { CustomCacheInterceptor } from './custom-cache.interceptor';

type ReqSubset = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
};

// Helper to build a minimal ExecutionContext with typed request
function makeCtx(req: ReqSubset): ExecutionContext {
  const http = {
    getRequest: () => req as unknown as Request,
  };
  return {
    switchToHttp: () => http,
  } as unknown as ExecutionContext;
}

describe('CustomCacheInterceptor.trackBy', () => {
  let cacheManager: Partial<Cache>;
  let reflector: Reflector;
  let interceptor: CustomCacheInterceptor;

  beforeEach(() => {
    cacheManager = {}; // we don’t use it in trackBy tests
    reflector = new Reflector();
    interceptor = new CustomCacheInterceptor(cacheManager as Cache, reflector);
  });

  it('returns undefined for non-GET requests', () => {
    const ctx = makeCtx({
      method: 'POST',
      path: '/api/v1/site/site-A/summary',
      params: { siteId: 'site-A' },
      query: { from: '2025-10-01', to: '2025-09-30' },
    });
    expect(interceptor.trackBy(ctx)).toBeUndefined();
  });

  it('builds site summary key with prefixed siteId', () => {
    const ctx = makeCtx({
      method: 'GET',
      path: '/api/v1/site/site-A/summary',
      params: { siteId: 'site-A' },
      query: { from: '2025-10-01', to: '2025-09-30' },
    });
    expect(interceptor.trackBy(ctx)).toBe(
      'summary:site-A:2025-10-01:2025-09-30',
    );
  });

  it('builds device latest key with prefixed deviceId', () => {
    const ctx = makeCtx({
      method: 'GET',
      path: '/api/v1/device/dev-2/latest',
      params: { deviceId: 'dev-2' },
      query: {},
    });
    expect(interceptor.trackBy(ctx)).toBe('latest:dev-2');
  });

  it('falls back to parent for non-matching GET routes', () => {
    const spy = jest
      .spyOn(CacheInterceptor.prototype as any, 'trackBy')
      .mockReturnValue('super-key');

    const ctx = makeCtx({
      method: 'GET',
      path: '/api/v1/users',
      params: {},
      query: { q: 'x' },
    });

    expect(interceptor.trackBy(ctx)).toBe('super-key');
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('handles missing params gracefully (device latest)', () => {
    const ctx = makeCtx({
      method: 'GET',
      path: '/api/v1/device/latest',
      params: {},
      query: {},
    });
    expect(interceptor.trackBy(ctx)).toBe('latest:');
  });

  it('handles missing params gracefully (site summary)', () => {
    const ctx = makeCtx({
      method: 'GET',
      path: '/api/v1/site/summary',
      params: {},
      query: { from: '2025-01-01', to: '2025-01-31' },
    });
    expect(interceptor.trackBy(ctx)).toBe('summary::2025-01-01:2025-01-31');
  });
});
