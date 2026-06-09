import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, colorize, printf, errors } = winston.format;
const fmt = printf(({ level, message, timestamp, stack }) =>
  `${timestamp} [${level}] ${stack ?? message}`);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), fmt),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), fmt),
    }),
    new DailyRotateFile({ dirname: 'logs', filename: 'bot-%DATE%.log', datePattern: 'YYYY-MM-DD', maxFiles: '14d' }),
    new DailyRotateFile({ dirname: 'logs', filename: 'error-%DATE%.log', datePattern: 'YYYY-MM-DD', level: 'error', maxFiles: '30d' }),
  ],
});

export default logger;
