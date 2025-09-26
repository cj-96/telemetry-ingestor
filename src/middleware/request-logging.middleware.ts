import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(RequestLoggingMiddleware.name);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = process.hrtime();

    // When response is finished, log structured info
    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const responseTimeMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

      this.logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          params: req.params,
          query: req.query,
          body: req.body as unknown,
          statusCode: res.statusCode,
          responseTimeMs,
        },
        'Incoming request processed',
      );
    });

    next();
  }
}
