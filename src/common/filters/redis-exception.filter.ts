import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';

@Catch(Error)
export class RedisExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    if (!exception.message.includes('Redis')) return;

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    res.status(503).json({
      statusCode: 503,
      message: 'Redis service unavailable',
      detail: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}
