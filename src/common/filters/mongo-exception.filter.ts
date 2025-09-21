import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { MongoError } from 'mongodb';
import { Response } from 'express';

@Catch(MongoError)
export class MongoExceptionFilter implements ExceptionFilter {
  catch(exception: MongoError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let message = 'Database error';
    if (exception.code === 11000) message = 'Duplicate key error';

    res.status(500).json({
      statusCode: 500,
      message,
      detail: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}
