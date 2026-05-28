/**
 * processors/urlProcessor_onestop.md.gov.js
 * Handles fetching + parsing each detail URL, with retry and error handling
 */

const client = require('../services/onestop.md.gov/client');
const { parseDetailPage } = require('../parsers/onestop.md.gov/parsers');
const { retry } = require('../utils/async');
const { formatError } = require('../utils/errors');
const logger = require('../utils/loggers');
const config = require('../../config');

const processDetailUrl = async (entry) => {
  const { currentPageUrl, fullName } = entry;

  try {
    const page = await retry(
      () => client.loadDetailPage(currentPageUrl),
      config.crawl.retryAttempts,
      config.crawl.retryDelayMs,
      fullName
    );

    const parsed = await parseDetailPage(page);

    return {
      ...parsed,
      _status: 'ok',
    };
  } catch (err) {
    logger.warn(`Failed to parse: ${fullName} — ${currentPageUrl} — ${err.message}`);
    return {
      fullName,
      currentPageUrl,
      sourceUrl: config.source.sourceUrl,
      scrapedAt: new Date().toISOString(),
      _status: 'error',
      _error: err.message,
    };
  }
};

module.exports = { processDetailUrl };
