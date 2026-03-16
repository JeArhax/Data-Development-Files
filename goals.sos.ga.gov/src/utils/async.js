// ============================================================
// utils/async.js
// ============================================================
const logger = require('./loggers');

/**
 * Wait a random duration between min and max ms.
 * Used to appear human-like between requests.
 */
async function randomDelay([min, max]) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  logger.debug(`Waiting ${ms}ms`);
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Wait exactly ms milliseconds.
 */
async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn - async function to retry
 * @param {number} maxRetries
 * @param {number} baseDelayMs - doubles each attempt
 * @param {string} label - for logging
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelayMs = 3000, label = 'operation') {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const waitMs = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`[retry] ${label} failed (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${waitMs}ms...`);
      if (attempt < maxRetries) await delay(waitMs);
    }
  }
  throw lastError;
}

module.exports = { randomDelay, delay, retryWithBackoff };
