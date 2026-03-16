// ============================================================
// main_goals.sos.ga.gov.js
// Entry point — run crawl loop via direct API, export JSONL + CSV
// ============================================================
const fs = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./src/utils/loggers');
const { flattenObject, toJsonlLine, recordsToCsv } = require('./src/utils/transforms');
const { processAllLicenseTypes } = require('./src/processors/urlProcessors_goals.sos.ga.gov');
const { closeBrowser } = require('./apiScraper');

// ── Output setup ────────────────────────────────────────────

function getOutputPaths() {
  const timestamp = new Date().toISOString().slice(0, 10);
  const base = path.join(config.OUTPUT_DIR, `${config.OUTPUT_PREFIX}_${timestamp}`);
  return {
    jsonl: `${base}.jsonl`,
    csv: `${base}.csv`,
    failedLog: path.join(config.OUTPUT_DIR, `failed_${timestamp}.jsonl`),
  };
}

function ensureOutputDir() {
  if (!fs.existsSync(config.OUTPUT_DIR)) {
    fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
    logger.info(`Created output directory: ${config.OUTPUT_DIR}`);
  }
}

// ── Output writers ──────────────────────────────────────────

class OutputWriter {
  constructor(paths) {
    this.paths = paths;
    this.jsonlStream = fs.createWriteStream(paths.jsonl, { flags: 'a' });
    this.failedStream = fs.createWriteStream(paths.failedLog, { flags: 'a' });
    this.csvBuffer = [];
    this.totalWritten = 0;

    logger.info(`Output JSONL: ${paths.jsonl}`);
    logger.info(`Output CSV will be written at completion: ${paths.csv}`);
  }

  async writeRecords(records) {
    for (const record of records) {
      if (record.rawParseError) {
        this.failedStream.write(toJsonlLine(record) + '\n');
        continue;
      }
      this.jsonlStream.write(toJsonlLine(record) + '\n');
      this.csvBuffer.push(flattenObject(record));
      this.totalWritten++;
    }
    logger.debug(`Written ${records.length} records (total: ${this.totalWritten})`);
  }

  async finalize() {
    if (this.csvBuffer.length > 0) {
      const csvContent = recordsToCsv(this.csvBuffer);
      fs.writeFileSync(this.paths.csv, csvContent, 'utf8');
      logger.info(`CSV written: ${this.paths.csv} (${this.csvBuffer.length} rows)`);
    } else {
      logger.warn('No records to write to CSV');
    }
    await new Promise((res) => this.jsonlStream.end(res));
    await new Promise((res) => this.failedStream.end(res));
    logger.info(`Total records written: ${this.totalWritten}`);
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  logger.info('============================================================');
  logger.info('GOALS GA Veterinary Licensee Scraper — starting (API mode)');
  logger.info(`License types to scrape: ${config.VET_LICENSE_TYPES.join(', ')}`);
  logger.info('============================================================');

  ensureOutputDir();
  const paths = getOutputPaths();
  const writer = new OutputWriter(paths);

  let finalStats = null;

  try {
    finalStats = await processAllLicenseTypes(async (records) => {
      await writer.writeRecords(records);
    });
  } catch (err) {
    logger.error(`Fatal error in main: ${err.message}`, { stack: err.stack });
  } finally {
    await closeBrowser();
    await writer.finalize();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info('============================================================');
  logger.info('Scrape complete');
  logger.info(`Duration: ${elapsed}s`);
  logger.info(`Total records: ${writer.totalWritten}`);
  if (finalStats) {
    logger.info('Stats by license type:');
    for (const [type, stats] of Object.entries(finalStats.byType)) {
      logger.info(`  ${type}: ${stats.total || 0} records, ${stats.pages || 0} pages`);
    }
  }
  logger.info(`Output: ${paths.jsonl}`);
  logger.info(`Output: ${paths.csv}`);
  logger.info('============================================================');
}

main().catch((err) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});