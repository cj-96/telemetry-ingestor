// filters/global-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

interface LogPayload {
  timestamp: string;
  path: string;
  method: string;
  status: number;
  message: string | object;
  stack?: string;
}

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttpException
      ? exception.getResponse()
      : ((exception as Error)?.message ?? 'Internal server error');

    const payload: LogPayload = {
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method,
      status,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    // 🔹 Structured JSON log with severity level
    this.logger.error(payload, 'Unhandled exception caught');

    // 🔹 Consistent API response
    res.status(status).json({
      statusCode: status,
      timestamp: payload.timestamp,
      path: payload.path,
      error: message,
    });
  }
}
