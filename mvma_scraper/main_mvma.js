/**
 * main_mvma.js — Entry point
 *
 * Usage:
 *   node main_mvma.js                  full run (all ~56 pages)
 *   node main_mvma.js --pages 3        test run: first 3 pages (~30 records)
 *   node main_mvma.js --headful        run with visible browser (debug)
 *
 * Outputs:
 *   no-sync/output/output_mvma.org_vets_YYYY-MM-DD.jsonl
 *   no-sync/output/output_mvma.org_vets_YYYY-MM-DD.csv
 */

'use strict';

const config     = require('./src/config');
const { crawlAll, exportResults } = require('./src/processors/urlProcessors_mvma.org');
const { closeBrowser }            = require('./src/services/mvma.org/client');
const logger = require('./src/utils/loggers');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const MAX_PAGES = parseInt(getArg('--pages') ?? '0', 10);
if (hasFlag('--headful')) config.PLAYWRIGHT_HEADLESS = false;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  logger.info('══════════════════════════════════════════════');
  logger.info('  MVMA Find-a-Vet Scraper — mvma.org');
  logger.info(`  Mode    : listing-only (HTML, Playwright)`);
  logger.info(`  Pages   : ${MAX_PAGES > 0 ? `first ${MAX_PAGES}` : 'all'}`);
  logger.info(`  Headless: ${config.PLAYWRIGHT_HEADLESS}`);
  logger.info('══════════════════════════════════════════════');

  const records = await crawlAll({ maxPages: MAX_PAGES });

  if (!records.length) {
    logger.warn('[main] No records collected. Check selectors or run with --headful to debug.');
    process.exit(0);
  }

  const { jsonlPath, csvPath } = await exportResults(records);

  const errors = records.filter((r) => r.rawParseError).length;

  logger.info('');
  logger.info('══════════════════════════════════════════════');
  logger.info('  RUN SUMMARY');
  logger.info(`  Records scraped : ${records.length}`);
  logger.info(`  Parse errors    : ${errors}`);
  logger.info(`  JSONL           : ${jsonlPath}`);
  logger.info(`  CSV             : ${csvPath}`);
  logger.info('══════════════════════════════════════════════');
}

main()
  .catch((err) => {
    logger.error(`[main] Fatal: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  })
  .finally(() => closeBrowser());
