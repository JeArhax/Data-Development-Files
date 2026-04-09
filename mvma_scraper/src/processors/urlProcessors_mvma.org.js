
const path   = require('path');
const fs     = require('fs');
const config = require('../config');
const client = require('../services/mvma.org/client');
const { parseCards } = require('../parsers/mvma.org/parsers');
const { flattenObject } = require('../utils/transforms');
const { timeWaitFor }   = require('../utils/async');
const logger = require('../utils/loggers');

// ── 1. Crawl ──────────────────────────────────────────────────────────────────

/**
 * Crawl all pages of the directory and return parsed records.
 *
 * @param {object} opts
 * @param {number} opts.maxPages  - cap page count (0 = no limit; for test runs use e.g. 3)
 * @returns {Promise<object[]>}
 */
async function crawlAll({ maxPages = 0 } = {}) {
  await client.openDirectory();

  const allRecords = [];
  let pageNum      = 0;
  let emptyStreak  = 0;

  while (true) {
    pageNum++;
    if (maxPages > 0 && pageNum > maxPages) {
      logger.info(`[processor] --pages limit reached (${maxPages}). Stopping.`);
      break;
    }

    // ── Paginator info (for logging) ──────────────────────────────────────────
    const info = await client.getPaginatorInfo();
    logger.info(`[processor] Page ${pageNum}${info ? ` (${info.raw})` : ''}`);

    // ── Extract cards from current view ───────────────────────────────────────
    let cardHTMLs;
    try {
      cardHTMLs = await client.getPageCards();
    } catch (err) {
      logger.error(`[processor] getPageCards failed on page ${pageNum}: ${err.message}`);
      cardHTMLs = [];
    }

    if (!cardHTMLs.length) {
      emptyStreak++;
      logger.warn(`[processor] No cards on page ${pageNum} (empty streak: ${emptyStreak})`);
      if (emptyStreak >= config.MAX_EMPTY_PAGES) {
        logger.warn('[processor] Too many consecutive empty pages — stopping.');
        break;
      }
    } else {
      emptyStreak = 0;
      const pageUrl = config.SOURCE_URL;
      const records = parseCards(cardHTMLs, pageUrl);
      allRecords.push(...records);
      logger.info(`[processor] Page ${pageNum}: parsed ${records.length} records (total: ${allRecords.length})`);
    }

    // ── Advance to next page ───────────────────────────────────────────────────
    let hasNext;
    try {
      hasNext = await client.goNextPage();
    } catch (err) {
      logger.error(`[processor] goNextPage failed: ${err.message}. Stopping.`);
      break;
    }

    if (!hasNext) {
      logger.info(`[processor] Last page reached after page ${pageNum}.`);
      break;
    }
  }

  logger.info(`[processor] Crawl complete. Total records: ${allRecords.length}`);
  return allRecords;
}

// ── 2. Export ─────────────────────────────────────────────────────────────────

/**
 * Write records to JSONL and CSV.
 *
 * @param {object[]} records
 * @param {string}   suffix  - date string for filename
 * @returns {{ jsonlPath, csvPath }}
 */
async function exportResults(records, suffix = '') {
  const outputDir = path.resolve(__dirname, '..', config.OUTPUT_DIR);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const tag      = suffix || new Date().toISOString().slice(0, 10);
  const jsonlPath = path.join(outputDir, `${config.OUTPUT_PREFIX}_${tag}.jsonl`);
  const csvPath   = path.join(outputDir, `${config.OUTPUT_PREFIX}_${tag}.csv`);

  // ── JSONL ─────────────────────────────────────────────────────────────────
  const jsonlStream = fs.createWriteStream(jsonlPath, { encoding: 'utf8' });
  for (const r of records) jsonlStream.write(JSON.stringify(r) + '\n');
  await new Promise((res) => jsonlStream.end(res));
  logger.info(`[processor] JSONL → ${jsonlPath} (${records.length} records)`);

  // ── CSV ───────────────────────────────────────────────────────────────────
  const allKeys   = new Set();
  const flatRecs  = records.map((r) => {
    const flat = flattenObject(r);
    Object.keys(flat).forEach((k) => allKeys.add(k));
    return flat;
  });

  // Priority column order — primary fields first
  const priority = [
    'fullName',
    'companyName', 'companyType',
    'companyPhone', 'companyWebsiteUrl',
    'companyAddress', 'companyCity', 'companyState', 'companyZip', 'companyLocation',
    'profileSpecies', 'profileSkills', 'profilePracticeOffers',
    'sourceUrl', 'currentPageUrl', 'scrapedAt',
  ];
  const rest    = [...allKeys].filter((k) => !priority.includes(k)).sort();
  const headers = [...priority.filter((k) => allKeys.has(k)), ...rest];

  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csvStream = fs.createWriteStream(csvPath, { encoding: 'utf8' });
  csvStream.write(headers.map(esc).join(',') + '\n');
  for (const flat of flatRecs) {
    csvStream.write(headers.map((h) => esc(flat[h])).join(',') + '\n');
  }
  await new Promise((res) => csvStream.end(res));
  logger.info(`[processor] CSV  → ${csvPath} (${records.length} rows, ${headers.length} cols)`);

  return { jsonlPath, csvPath };
}

module.exports = { crawlAll, exportResults };
