/**
 * utils/loggers.js — Logger utility
 */

const levels = { info: '📋', warn: '⚠️ ', error: '❌', success: '✅', debug: '🔍' };

const log = (level, msg) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${levels[level] || ''} ${msg}`);
};

module.exports = {
  info:    (msg) => log('info', msg),
  warn:    (msg) => log('warn', msg),
  error:   (msg) => log('error', msg),
  success: (msg) => log('success', msg),
  debug:   (msg) => log('debug', msg),
  progress: (current, total, label) => {
    process.stdout.write(`\r📦 [${current}/${total}] ${String(label).substring(0, 50).padEnd(50)}`);
  },
};
