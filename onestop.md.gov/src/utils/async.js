/**
 * utils/async.js — Async utility functions
 */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const retry = async (fn, attempts, delayMs, label = '') => {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      console.warn(`  [retry] ${label} attempt ${i}/${attempts} failed: ${err.message}. Retrying in ${delayMs}ms...`);
      await sleep(delayMs * i); // exponential backoff
    }
  }
};

module.exports = { sleep, retry };
