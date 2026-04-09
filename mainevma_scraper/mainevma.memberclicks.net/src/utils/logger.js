'use strict';

const dayjs = require('dayjs');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = {
  debug: '\x1b[36m',
  info:  '\x1b[32m',
  warn:  '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
};

const currentLevel = process.env.LOG_LEVEL || 'info';

function log(level, message, meta = null) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const ts = dayjs().format('YYYY-MM-DDTHH:mm:ss');
  const color = COLORS[level] || '';
  const reset = COLORS.reset;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`${color}[${ts}] [${level.toUpperCase()}] ${message}${metaStr}${reset}`);
}

const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

module.exports = logger;
