'use strict';

/**
 * urlProcessors_msvet.org.js
 *
 * Phase 1: Crawl all 22 listing pages → collect profileId + basic info
 * Phase 2: Visit each profile page → enrich with full detail
 * Save: JSONL + CSV after all phases complete
 */

const path   = require('path');
const fs     = require('fs');
const config = require('../../config');
const client = require('../services/msvet.org/client');
const { parseListingCards, parseProfilePage } = require('../parsers/parsers');
const { flattenObject } = require('../utils/transforms');
const { timeWaitFor }   = require('../utils/async');
const logger = require('../utils/loggers');

// ── Phase 1: Directory crawl ──────────────────────────────────────────────────

async function crawlListings({ maxPages = 0 } = {}) {
  await client.openDirectory();

  const allRecords = [];
  const seenIds    = new Set();
  let   pageNum    = 0;
  let   emptyStreak = 0;

  while (true) {
    pageNum++;
    if (maxPages > 0 && pageNum > maxPages) {
      logger.info(`[processor] Page limit ${maxPages} reached`);
      break;
    }

    const info = await client.getPageInfo();
    logger.info(`[processor] Page ${pageNum}${info ? ` (${info.raw})` : ''}`);

    let cardHTMLs = [];
    try {
      cardHTMLs = await client.getPageItems();
    } catch (err) {
      logger.error(`[processor] getPageItems failed on page ${pageNum}: ${err.message}`);
    }

    if (!cardHTMLs.length) {
      emptyStreak++;
      logger.warn(`[processor] No items on page ${pageNum} (streak: ${emptyStreak})`);
      if (emptyStreak >= config.MAX_EMPTY_PAGES) {
        logger.warn('[processor] Too many empty pages — stopping');
        break;
      }
    } else {
      emptyStreak = 0;
      const records = parseListingCards(cardHTMLs, config.SOURCE_URL);

      for (const r of records) {
        const key = r.profileId || r.fullName || `blank-${allRecords.length}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          allRecords.push(r);
        }
      }

      logger.info(`[processor] Page ${pageNum}: ${records.length} cards (total: ${allRecords.length})`);
    }

    // Check total from page info to know when we're done
    if (info && info.current && info.total && info.current >= info.total) {
      logger.info(`[processor] Reached last page (${info.current} of ${info.total})`);
      break;
    }

    let hasNext;
    try {
      hasNext = await client.goNextPage();
    } catch (err) {
      logger.error(`[processor] goNextPage error: ${err.message}`);
      break;
    }

    if (!hasNext) {
      logger.info(`[processor] No next page — listing crawl complete`);
      break;
    }
  }

  logger.info(`[processor] Phase 1 complete — ${allRecords.length} records collected`);
  return allRecords;
}

// ── Phase 2: Profile enrichment ───────────────────────────────────────────────

async function enrichProfiles(records) {
  const withProfiles = records.filter(r => r.profileId && !r.rawParseError);
  logger.info(`[processor] Phase 2: enriching ${withProfiles.length} profiles...`);

  for (let i = 0; i < records.length; i++) {
    const member = records[i];
    if (!member.profileId || member.rawParseError) continue;

    logger.info(`[processor] Profile ${i + 1}/${records.length}: ${member.fullName || member.profileId}`);

    try {
      const html = await client.getProfileHtml(member.profileId);
      parseProfilePage(html, member);
    } catch (err) {
      logger.warn(`[processor] Profile ${member.profileId} failed: ${err.message}`);
    }

    await timeWaitFor(config.PROFILE_DELAY);
  }

  logger.info('[processor] Phase 2 complete');
  return records;
}

// ── Export ────────────────────────────────────────────────────────────────────

async function exportResults(records, suffix = '') {
  const outputDir = path.resolve(__dirname, '..', '..', config.OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });

  const tag      = suffix || new Date().toISOString().slice(0, 10);
  const jsonlPath = path.join(outputDir, `${config.OUTPUT_PREFIX}_${tag}.jsonl`);
  const csvPath   = path.join(outputDir, `${config.OUTPUT_PREFIX}_${tag}.csv`);

  // JSONL
  const jStream = fs.createWriteStream(jsonlPath, { encoding: 'utf8' });
  for (const r of records) jStream.write(JSON.stringify(r) + '\n');
  await new Promise(res => jStream.end(res));
  logger.info(`[processor] JSONL → ${jsonlPath} (${records.length} records)`);

  // CSV
  const allKeys  = new Set();
  const flatRecs = records.map(r => {
    const flat = flattenObject(r);
    Object.keys(flat).forEach(k => allKeys.add(k));
    return flat;
  });

  const priority = [
    'fullName', 'profileId',
    'companyName', 'companyAddress', 'companyCity', 'companyZip',
    'companyPhone', 'companyWebsiteUrl',
    'profileEmail', 'profilePhone',
    'memberType', 'bio',
    'profilePageUrl', 'sourceUrl', 'currentPageUrl', 'scrapedAt',
  ];
  const rest    = [...allKeys].filter(k => !priority.includes(k)).sort();
  const headers = [...priority.filter(k => allKeys.has(k)), ...rest];

  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    const e = s.replace(/"/g, '""');
    return e.includes(',') || e.includes('"') || e.includes('\n') ? `"${e}"` : e;
  };

  const cStream = fs.createWriteStream(csvPath, { encoding: 'utf8' });
  cStream.write(headers.join(',') + '\n');
  for (const flat of flatRecs) {
    cStream.write(headers.map(h => esc(flat[h])).join(',') + '\n');
  }
  await new Promise(res => cStream.end(res));
  logger.info(`[processor] CSV → ${csvPath} (${records.length} rows)`);

  return { jsonlPath, csvPath };
}

module.exports = { crawlListings, enrichProfiles, exportResults };
