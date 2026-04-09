'use strict';

/**
 * main_nhvma.js — Entry point
 *
 * NOTE: Profile pages require login — Phase 2 is disabled.
 * All data is extracted from listing cards only.
 *
 * Usage:
 *   node main_msvet.js              full run (all pages)
 *   node main_msvet.js --pages 3   test: first 3 pages
 *   node main_msvet.js --headful   visible browser
 */

const config = require('./config');
const { crawlListings, exportResults } = require('./src/processors/urlProcessors_nhvma');
const { closeBrowser } = require('./src/services/msvet.org/client');
const logger = require('./src/utils/loggers');

const args    = process.argv.slice(2);
const getArg  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const MAX_PAGES = parseInt(getArg('--pages') ?? '0', 10);
if (hasFlag('--headful')) config.PLAYWRIGHT_HEADLESS = false;

async function main() {
  logger.info('══════════════════════════════════════════════');
  logger.info('  NHVMA Scraper — nhvma.com');
  logger.info('  Note: Profiles require login — listing data only');
  logger.info(`  Pages   : ${MAX_PAGES > 0 ? `first ${MAX_PAGES}` : 'all'}`);
  logger.info(`  Headless: ${config.PLAYWRIGHT_HEADLESS}`);
  logger.info('══════════════════════════════════════════════');

  const records = await crawlListings({ maxPages: MAX_PAGES });

  if (!records.length) {
    logger.warn('[main] No records — check selectors or run with --headful');
    return;
  }

  logger.info(`[main] ${records.filter(r => r.profileId).length} members have public profiles`);
  logger.info(`[main] ${records.filter(r => !r.profileId).length} members are listing-only (no public profile)`);

  const { jsonlPath, csvPath } = await exportResults(records);
  const errors = records.filter(r => r.rawParseError).length;

  logger.info('══════════════════════════════════════════════');
  logger.info(`  Records : ${records.length}`);
  logger.info(`  Errors  : ${errors}`);
  logger.info(`  JSONL   : ${jsonlPath}`);
  logger.info(`  CSV     : ${csvPath}`);
  logger.info('══════════════════════════════════════════════');
}

main()
  .catch(err => { logger.error(`[main] Fatal: ${err.message}`); process.exit(1); })
  .finally(() => closeBrowser());
