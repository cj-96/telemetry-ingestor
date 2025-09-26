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
    // Set context for structured logging
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Default status and client message
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientMessage = 'Internal server error';

    // Handle known HTTP exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      clientMessage = typeof res === 'string' ? res : 'Request failed';

      // Optional debug log for HTTP errors
      this.logger.debug(
        { path: request.url, method: request.method, status },
        'HTTP exception caught',
      );
    }

    // Convert unknown exceptions to Error object
    const err =
      exception instanceof Error ? exception : new Error(String(exception));

    // Log the error with full context
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

    // Optional warn for 4xx errors
    if (
      status >= HttpStatus.BAD_REQUEST &&
      status < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      this.logger.warn(
        {
          path: request.url,
          method: request.method,
          status,
          message: clientMessage,
        },
        'Client error',
      );
    }

    // Respond safely to client
    response.status(status).json({
      statusCode: status,
      message: clientMessage,
      // Include stack trace only in non-production environments
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
  }
}
