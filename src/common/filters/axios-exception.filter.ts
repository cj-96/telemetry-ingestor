import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { AxiosError } from 'axios';
import { Response } from 'express';

@Catch(AxiosError)
export class AxiosExceptionFilter implements ExceptionFilter {
  catch(exception: AxiosError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const status = exception.response?.status ?? 500;

    res.status(status).json({
      statusCode: status,
      message: exception.message,
      data: exception.response?.data ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}
