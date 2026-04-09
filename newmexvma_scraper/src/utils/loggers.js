'use strict';

const COLORS = { INFO: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m', DEBUG: '\x1b[36m' };
const RESET  = '\x1b[0m';

function log(level, msg, meta) {
  const ts    = new Date().toISOString();
  const color = COLORS[level] || '';
  const out   = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  console.log(`${color}[${ts}] [${level}] ${out}${RESET}`);
}

module.exports = {
  info:  (msg, meta) => log('INFO',  msg, meta),
  warn:  (msg, meta) => log('WARN',  msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta),
  debug: (msg, meta) => log('DEBUG', msg, meta),
};
