'use strict';

/**
 * main_nysvms.js — Entry point
 *
 * Usage:
 *   node main_nysvms.js                   full run
 *   node main_nysvms.js --skip-profiles   listing only (faster)
 *   node main_nysvms.js --headful         visible browser
 */

const fs   = require('fs');
const path = require('path');

const { crawlDirectory, saveJsonl, saveCsv } = require('./src/processors/urlProcessor_nysvms');
const logger = require('./src/utils/loggers');
const config = require('./config');

const args    = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--headful')) config.PLAYWRIGHT_HEADLESS = false;
const SKIP_PROFILES = hasFlag('--skip-profiles');

async function main() {
  logger.info('══════════════════════════════════════════════');
  logger.info('  NYSVMS Hospital Scraper — members.nysvms.org');
  logger.info(`  Profiles: ${SKIP_PROFILES ? 'skipped' : 'enabled'}`);
  logger.info(`  Headless: ${config.PLAYWRIGHT_HEADLESS}`);
  logger.info('══════════════════════════════════════════════');

  // Temporarily patch to skip profiles if flag set
  if (SKIP_PROFILES) {
    const proc = require('./src/processors/urlProcessor_nysvms');
    const orig = proc.crawlDirectory;
    // We'll handle this by setting a global flag the processor checks
    process.env.SKIP_PROFILES = '1';
  }

  const members = await crawlDirectory();

  if (!members.length) {
    logger.warn('[main] No records — check selectors or run with --headful');
    return;
  }

  const outDir = path.resolve(__dirname, config.OUTPUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const date      = new Date().toISOString().slice(0, 10);
  const jsonlPath = path.join(outDir, `${config.OUTPUT_PREFIX}_${date}.jsonl`);
  const csvPath   = path.join(outDir, `${config.OUTPUT_PREFIX}_${date}.csv`);

  saveJsonl(members, jsonlPath);
  saveCsv(members, csvPath);

  logger.info('══════════════════════════════════════════════');
  logger.info(`  Records : ${members.length}`);
  logger.info(`  JSONL   : ${jsonlPath}`);
  logger.info(`  CSV     : ${csvPath}`);
  logger.info('══════════════════════════════════════════════');
}

main().catch(err => {
  logger.error('[main] Fatal', { message: err.message, stack: err.stack });
  process.exit(1);
});
