/**
 * utils/loggers.js — Simple levelled logger
 */

const config = require('../config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[config.LOG_LEVEL] ?? LEVELS.info;

function ts() {
  return new Date().toISOString();
}

function log(level, ...args) {
  if (LEVELS[level] >= currentLevel) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${ts()}] [${level.toUpperCase()}]`, ...args);
  }
}

module.exports = {
  debug: (...a) => log('debug', ...a),
  info:  (...a) => log('info',  ...a),
  warn:  (...a) => log('warn',  ...a),
  error: (...a) => log('error', ...a),
};
