import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Response, Request } from 'express';

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: {
      statusCode: number;
      error: string;
      message: string | string[];
    } = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        errorResponse = {
          statusCode: status,
          error: HttpStatus[status] ?? 'Error',
          message: exceptionResponse,
        };
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as Record<string, any>;
        errorResponse = {
          statusCode: status,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          error: res.error ?? HttpStatus[status] ?? 'Error',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message: res.message ?? 'Unexpected error',
        };
      }

      if (
        status >= HttpStatus.BAD_REQUEST &&
        status < HttpStatus.INTERNAL_SERVER_ERROR
      ) {
        this.logger.warn(
          {
            path: request.url,
            method: request.method,
            ...errorResponse,
          },
          'Client-side error (4xx)',
        );
      } else {
        this.logger.error(
          {
            path: request.url,
            method: request.method,
            ...errorResponse,
          },
          'Server-side error (5xx)',
        );
      }
    } else {
      const err =
        exception instanceof Error ? exception : new Error(String(exception));

      this.logger.error(
        {
          path: request.url,
          method: request.method,
          status,
          errorName: err.name,
          errorMessage: err.message,
          stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
        },
        'Unhandled exception',
      );

      errorResponse = {
        statusCode: status,
        error: 'Internal Server Error',
        message: 'Internal server error',
      };
    }

    // 🚀 Always send consistent error response
    response.status(status).json(errorResponse);
  }
}
