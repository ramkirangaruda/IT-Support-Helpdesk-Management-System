import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx   = host.switchToHttp();
    const res   = ctx.getResponse<Response>();
    const req   = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b['message'] as string | string[]) ?? message;
        error   = (b['error']   as string)             ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 = unique-constraint violation → 409 Conflict
      if (exception.code === 'P2002') {
        const fields = (exception.meta?.['target'] as string[] | undefined)?.join(', ') ?? 'field';
        statusCode = HttpStatus.CONFLICT;
        error      = 'Conflict';
        message    = `A record with the same ${fields} already exists`;
      } else {
        this.logger.error(`Prisma error ${exception.code}`, exception.message);
      }
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(statusCode).json({
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
