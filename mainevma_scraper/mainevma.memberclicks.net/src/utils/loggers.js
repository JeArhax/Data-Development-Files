// ============================================================
// src/utils/loggers.js — Lightweight structured logger
// ============================================================

const config = require('../../config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
};

const configLevel = LEVELS[config.log?.level ?? 'info'] ?? 1;

/**
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object} [meta]
 */
function log(level, message, meta) {
  if (LEVELS[level] < configLevel) return;
  const ts   = new Date().toISOString();
  const col  = COLORS[level] ?? '';
  const rst  = COLORS.reset;
  const tag  = `[${level.toUpperCase().padEnd(5)}]`;
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  const out  = level === 'error' ? process.stderr : process.stdout;
  out.write(`${col}${ts} ${tag}${rst} ${message}${metaStr}\n`);
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
