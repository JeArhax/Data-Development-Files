// ============================================================
// utils/loggers.js
// ============================================================
const winston = require('winston');
const config = require('../../config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}] ${stack || message}${metaStr}`;
});

const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    new winston.transports.File({
      filename: `${config.OUTPUT_DIR}/scraper_error.log`,
      level: 'error',
    }),
    new winston.transports.File({
      filename: `${config.OUTPUT_DIR}/scraper.log`,
    }),
  ],
});

module.exports = logger;
