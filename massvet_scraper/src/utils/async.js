'use strict';

/**
 * Wait for a given number of milliseconds.
 */
async function timeWaitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff retry wrapper.
 * @param {Function} fn       - Async function to retry
 * @param {number}   retries  - Max attempts
 * @param {number}   baseMs   - Base delay in ms (doubles each retry)
 * @param {string}   label    - Label for logging
 */
async function withRetry(fn, retries = 3, baseMs = 2000, label = 'operation') {
  const logger = require('./logger');
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) {
        logger.error(`[withRetry] ${label} failed after ${retries} attempts`, { error: err.message });
        throw err;
      }
      const delay = baseMs * Math.pow(2, attempt - 1);
      logger.warn(`[withRetry] ${label} attempt ${attempt} failed, retrying in ${delay}ms`, {
        error: err.message,
      });
      await timeWaitFor(delay);
    }
  }
}

module.exports = { timeWaitFor, withRetry };
