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

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : (exception as any)?.message || 'Error interno del servidor';

    const errorLog = {
      method: req.method,
      url: req.originalUrl,
      status,
      ip: req.ip,
      user: (req as any).user?.email || 'Anonimo',
      dbName: (req as any).user?.dbName || 'Desconocido',
      body: req.method !== 'GET' ? filterBody(req.body) : undefined,
      query: req.query,
      error: typeof message === 'string' ? message : JSON.stringify(message),
      stack: (exception as any)?.stack,
    };

    winstonLogger.error(`[${req.method}] ${req.originalUrl} -> ${errorLog.error}`, errorLog);

    res.status(status).json({ statusCode: status, message });
  }
}

function filterBody(body: any) {
  if (!body || typeof body !== 'object') return body;
  const filtered = { ...body };
  if ('password' in filtered) filtered.password = '[PROTECTED]';
  return filtered;
}
