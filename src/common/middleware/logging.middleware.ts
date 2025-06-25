import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { winstonLogger } from '../../logger/winston.logger';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, body, query } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const status = res.statusCode;
      const duration = Date.now() - startTime;

      const logEntry = {
        timestamp: new Date().toISOString(),
        method,
        url: originalUrl,
        status,
        ip: req.ip,
        user: (req as any).user?.email || 'Anonimo',
        dbName: (req as any).user?.dbName || 'Desconocido',
        body: method !== 'GET' ? filterBody(body) : undefined,
        query,
      };

      winstonLogger.info(`[${method}] ${originalUrl} ${status}`, logEntry);
    });

    next();
  }
}

function filterBody(body: any) {
  if (!body || typeof body !== 'object') return body;
  const filtered = { ...body };
  // Elimina campos sensibles si es necesario
  if ('password' in filtered) filtered.password = '[PROTECTED]';
  return filtered;
}
