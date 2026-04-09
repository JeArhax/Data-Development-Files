'use strict';

/**
 * main_msvet.js — Entry point
 *
 * Usage:
 *   node main_msvet.js                   full run (all pages + all profiles)
 *   node main_msvet.js --pages 3         test: first 3 listing pages only
 *   node main_msvet.js --skip-profiles   listing only, no profile visits
 *   node main_msvet.js --headful         visible browser
 */

const config = require('./src/config');
const { crawlListings, enrichProfiles, exportResults } = require('./src/processors/urlProcessors_msvet.org');
const { closeBrowser } = require('./src/services/msvet.org/client');
const logger = require('./src/utils/loggers');

const args     = process.argv.slice(2);
const getArg   = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag  = (flag) => args.includes(flag);

const MAX_PAGES     = parseInt(getArg('--pages') ?? '0', 10);
const SKIP_PROFILES = hasFlag('--skip-profiles');
if (hasFlag('--headful')) config.PLAYWRIGHT_HEADLESS = false;

async function main() {
  logger.info('══════════════════════════════════════════════');
  logger.info('  MSVET Scraper — msvet.org');
  logger.info(`  Pages   : ${MAX_PAGES > 0 ? `first ${MAX_PAGES}` : 'all'}`);
  logger.info(`  Profiles: ${SKIP_PROFILES ? 'skipped' : 'enabled'}`);
  logger.info(`  Headless: ${config.PLAYWRIGHT_HEADLESS}`);
  logger.info('══════════════════════════════════════════════');

  // Phase 1: listing crawl
  const records = await crawlListings({ maxPages: MAX_PAGES });

  if (!records.length) {
    logger.warn('[main] No records collected — check selectors or run with --headful');
    return;
  }

  // Phase 2: profile enrichment
  if (!SKIP_PROFILES) {
    await enrichProfiles(records);
  }

  // Save
  const { jsonlPath, csvPath } = await exportResults(records);

  const errors = records.filter(r => r.rawParseError).length;

  logger.info('══════════════════════════════════════════════');
  logger.info('  RUN SUMMARY');
  logger.info(`  Records   : ${records.length}`);
  logger.info(`  Errors    : ${errors}`);
  logger.info(`  JSONL     : ${jsonlPath}`);
  logger.info(`  CSV       : ${csvPath}`);
  logger.info('══════════════════════════════════════════════');
}

main()
  .catch(err => {
    logger.error(`[main] Fatal: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  })
  .finally(() => closeBrowser());
