import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { winstonLogger } from '../../logger/winston.logger';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : (exception as any)?.message || 'Error interno del servidor';

    // ✅ Normalizar el mensaje para que siempre sea un string
    let message: string;
    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
      message = (exceptionResponse as any).message;
    } else {
      message = 'Error desconocido';
    }

    const errorLog = {
      method: req.method,
      url: req.originalUrl,
      status,
      user: (req as any).user?.email || 'Anonimo',
      dbName: (req as any).user?.dbName || 'Desconocido',
      body: req.method !== 'GET' ? filterBody(req.body) : undefined,
      query: req.query,
      error: message,
      stack: (exception as any)?.stack,
    };

    winstonLogger.error(`[${req.method}] ${req.originalUrl} -> ${errorLog.error}`, errorLog);

    res.status(status).json({
      statusCode: status,
      message, // ✅ Ya es string plano
    });
  }
}

function filterBody(body: any) {
  if (!body || typeof body !== 'object') return body;
  const filtered = { ...body };
  if ('password' in filtered) filtered.password = '[PROTECTED]';
  return filtered;
}
