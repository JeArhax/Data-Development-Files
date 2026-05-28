/**
 * main_onestop.md.gov.js
 * Orchestrates the full scrape: list → scroll → collect URLs → detail pages → export
 *
 * Usage:
 *   npm install puppeteer
 *   node main_onestop.md.gov.js
 *
 * Resume: Re-run the same command — already-scraped URLs are skipped automatically.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const client = require('./src/services/onestop.md.gov/client');
const { processDetailUrl } = require('./src/processors/urlProcessor_onestop.md.gov');
const logger = require('./src/utils/loggers');
const { flattenObject } = require('./src/utils/transforms');

// ─── Output helpers ───────────────────────────────────────────────────────────

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const appendJsonl = (filePath, record) => {
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
};

const writeCsvRow = (filePath, record, headers) => {
  const row = headers.map(h => {
    const val = record[h] ?? '';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }).join(',');
  fs.appendFileSync(filePath, row + '\n', 'utf8');
};

// ─── Resume helpers ───────────────────────────────────────────────────────────

const loadAlreadyScraped = () => {
  const scrapedUrls = new Set();
  if (!fs.existsSync(config.output.jsonlFile)) return scrapedUrls;

  try {
    const lines = fs.readFileSync(config.output.jsonlFile, 'utf8').trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (record.currentPageUrl) scrapedUrls.add(record.currentPageUrl);
      } catch (_) {}
    }
    logger.info(`Resume: found ${scrapedUrls.size} already-scraped records.`);
  } catch (e) {
    logger.warn('Could not read existing JSONL file — starting fresh.');
  }

  return scrapedUrls;
};

// ─── CSV header management ────────────────────────────────────────────────────

let csvHeaders = null;

const initCsv = (filePath, record) => {
  if (csvHeaders) return;
  csvHeaders = Object.keys(flattenObject(record));
  fs.writeFileSync(filePath, csvHeaders.join(',') + '\n', 'utf8');
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  logger.info('=== MD Veterinarians Scraper — onestop.md.gov ===');

  ensureDir(config.output.jsonlFile);
  ensureDir(config.output.csvFile);
  ensureDir(config.output.failedFile);

  // --- Load already-scraped URLs for resume ---
  const scrapedUrls = loadAlreadyScraped();

  // --- Launch browser ---
  await client.launch();

  try {
    // --- Step 1: Load list page (captcha handled manually if needed) ---
    await client.loadListPage();

    // --- Step 2: Scroll until all records are loaded ---
    await client.scrollUntilAllLoaded();

    // --- Step 3: Collect all entries from the list ---
    const allEntries = await client.collectListEntries();
    logger.success(`Collected ${allEntries.length} total entries from list.`);

    // --- Step 4: Filter out already-scraped ---
    const toScrape = allEntries.filter(e => !scrapedUrls.has(e.currentPageUrl));
    logger.info(`Remaining to scrape: ${toScrape.length} (${scrapedUrls.size} already done)`);

    if (toScrape.length === 0) {
      logger.success('All records already scraped! Exiting.');
      return;
    }

    // --- Step 5: Scrape each detail page ---
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < toScrape.length; i++) {
      const entry = toScrape[i];
      logger.progress(i + 1, toScrape.length, entry.fullName);

      const record = await processDetailUrl(entry);

      // Write to JSONL (always)
      appendJsonl(config.output.jsonlFile, record);

      // Write to CSV
      const flat = flattenObject(record);
      if (!csvHeaders) {
        initCsv(config.output.csvFile, record);
      }
      writeCsvRow(config.output.csvFile, flat, csvHeaders);

      // Log failures separately
      if (record._status === 'error') {
        appendJsonl(config.output.failedFile, record);
        errorCount++;
      } else {
        successCount++;
      }

      // Save progress log every N records
      if ((i + 1) % config.crawl.batchSaveInterval === 0) {
        console.log(''); // newline after progress
        logger.info(`Progress: ${i + 1}/${toScrape.length} — ✅ ${successCount} ok, ❌ ${errorCount} errors`);
      }
    }

    console.log('');
    logger.success(`Scrape complete! ✅ ${successCount} success, ❌ ${errorCount} errors`);
    logger.info(`JSONL → ${config.output.jsonlFile}`);
    logger.info(`CSV  → ${config.output.csvFile}`);
    if (errorCount > 0) logger.warn(`Failed → ${config.output.failedFile}`);

  } catch (err) {
    logger.error(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await client.close();
  }
};

main();
