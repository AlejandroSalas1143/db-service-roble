// src/logger/winston.logger.ts
import { createLogger, format, transports } from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file';

const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const dailyFormat = format.combine(
  format.timestamp(),
  format.json()
);

export const winstonLogger = createLogger({
  level: 'info',
  format: dailyFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxFiles: '14d', // mantener logs por 14 días
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d', // mantener errores por 30 días
    }),
  ],
});
