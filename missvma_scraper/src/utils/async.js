/**
 * utils/async.js — Async helpers: delay, retry with backoff, batching
 */

const config = require('../config');
const logger = require('./loggers');

/**
 * Sleep for ms milliseconds.
 */
async function timeWaitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async fn up to `attempts` times with exponential backoff.
 * Distinguishes transient network errors from permanent parse/logic errors.
 *
 * @param {Function} fn          - async function to retry
 * @param {object}   opts
 * @param {number}   opts.attempts   - max attempts (default: config.RETRY_ATTEMPTS)
 * @param {number}   opts.baseDelay  - base ms for backoff (default: config.RETRY_BASE_DELAY)
 * @param {string}   opts.label      - label for logging
 * @returns {Promise<*>}
 */
async function withRetry(fn, { attempts = config.RETRY_ATTEMPTS, baseDelay = config.RETRY_BASE_DELAY, label = 'task' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRetryable = err.name === 'NetworkError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || (err.response && err.response.status >= 500);
      if (!isRetryable || attempt === attempts) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(`[withRetry] "${label}" failed (attempt ${attempt}/${attempts}). Retrying in ${delay}ms. Error: ${err.message}`);
      await timeWaitFor(delay);
    }
  }
  throw lastErr;
}

/**
 * Process an array in batches of `size` with a delay between batches.
 *
 * @param {Array}    items
 * @param {number}   size      - batch size
 * @param {Function} handler   - async (item, index) => result
 * @param {number}   delay     - ms between batches
 * @returns {Promise<Array>}   - flattened results (nulls for failed items)
 */
async function processBatch(items, size, handler, delay = config.DELAY_BETWEEN_REQS) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.all(
      batch.map((item, j) => handler(item, i + j).catch((err) => {
        logger.error(`[processBatch] Item ${i + j} failed: ${err.message}`);
        return null;
      }))
    );
    results.push(...batchResults);
    if (i + size < items.length) {
      await timeWaitFor(delay);
    }
  }
  return results;
}

module.exports = { timeWaitFor, withRetry, processBatch };
