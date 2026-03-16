// ============================================================
// src/processors/urlProcessors_goals.sos.ga.gov.js
// Phase 1: collect all IDs, Phase 2: fetch profile details
// ============================================================
const fs = require('fs');
const path = require('path');

const config = require('../../config');
const logger = require('../utils/loggers');
const { delay, randomDelay } = require('../utils/async');
const client = require('../services/goals.sos.ga.gov/client');
const { parseSearchRows, parsePageInfo, parseProfilePage } = require('../parsers/goals.sos.ga.gov/parsers');

const OUTPUT_DIR = './no-sync/output';
const SOURCE_URL = 'goals.sos.ga.gov';

// ── Phase 1: Collect all rows from all search pages ───────────

async function phase1CollectAllIds(profession, licenseType) {
  const safeType = licenseType.replace(/\s+/g, '_');
  const cacheFile = path.join(OUTPUT_DIR, `phase1_ids_${safeType}.json`);

  // Resume from existing cache if available
  let allRows = [];
  let startPage = 1;

  if (fs.existsSync(cacheFile)) {
    allRows = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

    // Check if complete (10480 for Veterinarian)
    if (allRows.length >= 10480) {
      logger.info(`[Phase 1] Already complete: ${allRows.length} records for "${licenseType}"`);
      return allRows;
    }

    // Resume from last saved page
    if (allRows.length > 0) {
      startPage = Math.floor(allRows.length / 25) + 1;
      logger.info(`[Phase 1] Resuming from page ${startPage} (${allRows.length} records collected so far)`);
    }
  }

  logger.info(`\n[Phase 1] Collecting all rows for: "${licenseType}" (starting page ${startPage})`);

  const page = client.getPage();
  await client.doSearch(profession, licenseType);

  const pageInfo = await parsePageInfo(page);
  const totalPages = pageInfo.totalPages || 420;
  logger.info(`[Phase 1] Total pages: ${totalPages} | Total results: ${pageInfo.totalResults}`);

  // Skip forward to resume page
  if (startPage > 1) {
    await client.skipToPage(startPage);
  }

  let pageNum = startPage;

  while (pageNum <= totalPages) {
    // Check for captcha error before reading rows
    if (await client.isAuraErrorVisible()) {
      logger.warn(`[Phase 1] Page ${pageNum}: captcha error — solving via 2captcha...`);
      _saveCheckpoint(cacheFile, allRows, pageNum);

      // Try to solve in-place first (preserves page position)
      const solvedInPlace = await client.solveCaptchaAndResubmit(profession, licenseType);

      if (!solvedInPlace) {
        // Had to re-search — skip back to current page
        logger.info(`[Phase 1] Re-search done — skipping back to page ${pageNum}...`);
        await client.skipToPage(pageNum);
      }
    }

    const rows = await parseSearchRows(page);

    if (rows.length === 0) {
      logger.warn(`[Phase 1] Page ${pageNum}: 0 rows — checking for captcha...`);
      await delay(2000);

      // Try solving captcha if error is visible
      if (await client.isAuraErrorVisible()) {
        _saveCheckpoint(cacheFile, allRows, pageNum);
        const solvedInPlace = await client.solveCaptchaAndResubmit(profession, licenseType);
        if (!solvedInPlace) {
          await client.skipToPage(pageNum);
        }
      }

      const retryRows = await parseSearchRows(page);
      if (retryRows.length > 0) {
        allRows.push(...retryRows);
        logger.info(`[Phase 1] Page ${pageNum}/${totalPages}: ${retryRows.length} rows (retry) | total: ${allRows.length}`);
      } else {
        logger.warn(`[Phase 1] Page ${pageNum}: still 0 rows after captcha solve — skipping`);
      }
    } else {
      allRows.push(...rows);
      logger.info(`[Phase 1] Page ${pageNum}/${totalPages}: ${rows.length} rows | total: ${allRows.length}`);
    }

    // Save checkpoint every 25 pages
    if (pageNum % 25 === 0) {
      _saveCheckpoint(cacheFile, allRows, pageNum);
    }

    if (pageNum >= totalPages) break;
    const hasNext = await client.clickNextPage();
    if (!hasNext) break;
    pageNum++;
  }

  fs.writeFileSync(cacheFile, JSON.stringify(allRows, null, 2));
  logger.info(`\n[Phase 1] Complete. ${allRows.length} total records saved to ${cacheFile}`);
  return allRows;
}

// ── Phase 2: Fetch profile detail for each row ────────────────

async function phase2FetchDetails(allRows, profession, licenseType, onRecord) {
  const safeType = licenseType.replace(/\s+/g, '_');
  const progressFile = path.join(OUTPUT_DIR, `phase2_progress_${safeType}.json`);

  // Load progress to resume
  let doneIds = new Set();
  if (fs.existsSync(progressFile)) {
    doneIds = new Set(JSON.parse(fs.readFileSync(progressFile, 'utf8')));
    logger.info(`[Phase 2] Resuming — ${doneIds.size} already done`);
  }

  const remaining = allRows.filter(r => r.dataId && !doneIds.has(r.dataId));
  logger.info(`\n[Phase 2] Fetching details for ${remaining.length} of ${allRows.length} records...`);

  const page = client.getPage();
  await client.doSearch(profession, licenseType);

  let done = 0;
  const batch = [];

  for (const row of remaining) {
    const num = done + doneIds.size + 1;
    process.stdout.write(`  [${num}/${allRows.length}] ${row.fullName}...\r`);

    let detail = null;
    let retries = 0;

    while (retries < 3) {
      try {
        // Navigate directly using profile URL (no need to find link in table)
        if (row.profileUrl) {
          await page.goto(row.profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await delay(1500);
        } else {
          const link = await page.$(`a[data-id="${row.dataId}"]`);
          if (!link) throw new Error('Profile link not found on page');
          await link.click();
          await delay(1500);
        }

        await page.waitForSelector('.title-label', { timeout: 15000 });
        await delay(1000);
        detail = await parseProfilePage(page);

        // Go back to search results
        await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(async () => {
          await client.doSearch(profession, licenseType);
        });
        await delay(1000);
        break;
      } catch(e) {
        retries++;
        logger.warn(`\n[Phase 2] Retry ${retries}/3 for "${row.fullName}": ${e.message}`);
        await client.dismissAuraError();
        await client.doSearch(profession, licenseType);
        await delay(2000);
      }
    }

    const record = {
      ...row,
      ...(detail || {}),
      sourceUrl: SOURCE_URL,
      scrapedAt: new Date().toISOString(),
    };

    batch.push(record);
    doneIds.add(row.dataId);
    done++;

    // Flush batch every 25 records
    if (batch.length >= 25) {
      await onRecord(batch.splice(0));
      fs.writeFileSync(progressFile, JSON.stringify([...doneIds]));
    }

    await randomDelay([800, 1500]);
  }

  // Flush remaining
  if (batch.length > 0) {
    await onRecord(batch);
    fs.writeFileSync(progressFile, JSON.stringify([...doneIds]));
  }

  logger.info(`\n[Phase 2] Done: ${done} new records fetched`);
}

// ── Orchestrator ──────────────────────────────────────────────

async function processLicenseType(licenseType, onRecord) {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Starting crawl for license type: "${licenseType}"`);
  logger.info('='.repeat(60));

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Launch browser once — launchBrowser() is idempotent (does nothing if already open)
  await client.launchBrowser();

  const stats = { total: 0, errors: 0 };

  try {
    // Phase 1: collect all IDs (fast, ~10 min, cached)
    const allRows = await phase1CollectAllIds(config.PROFESSION_TYPE, licenseType);

    // Phase 2: fetch profile detail for each (slow, ~3-5 hrs, resumable)
    await phase2FetchDetails(allRows, config.PROFESSION_TYPE, licenseType, async (records) => {
      await onRecord(records);
      stats.total += records.length;
      logger.info(`  ✓ ${records.length} records saved (cumulative: ${stats.total})`);
    });

    logger.info(`Finished "${licenseType}": ${stats.total} total records`);
  } catch(err) {
    logger.error(`Error processing "${licenseType}": ${err.message}`, { stack: err.stack });
    stats.errors++;
  }

  return stats;
}

async function processAllLicenseTypes(onRecord) {
  const allStats = { total: 0, errors: 0, byType: {} };

  for (const licenseType of config.VET_LICENSE_TYPES) {
    const stats = await processLicenseType(licenseType, onRecord);
    allStats.total += stats.total;
    allStats.errors += stats.errors;
    allStats.byType[licenseType] = stats;

    // Delay between license types
    if (config.VET_LICENSE_TYPES.indexOf(licenseType) < config.VET_LICENSE_TYPES.length - 1) {
      logger.info('Waiting before next license type...');
      await randomDelay(config.DELAY_BETWEEN_TYPES_MS || 3000, (config.DELAY_BETWEEN_TYPES_MS || 3000) + 2000);
    }
  }

  return allStats;
}

// ── Helpers ───────────────────────────────────────────────────

function _saveCheckpoint(cacheFile, rows, pageNum) {
  fs.writeFileSync(cacheFile, JSON.stringify(rows, null, 2));
  logger.info(`[Phase 1] Checkpoint saved: ${rows.length} records at page ${pageNum}`);
}

module.exports = { processLicenseType, processAllLicenseTypes, closeBrowser: client.closeBrowser };