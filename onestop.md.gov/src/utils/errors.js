/**
 * utils/errors.js — Error utility
 */

class ScraperError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'ScraperError';
    this.context = context;
  }
}

const formatError = (err, context = {}) => ({
  error: err.message || String(err),
  errorType: err.name || 'UnknownError',
  context,
});

module.exports = { ScraperError, formatError };
