'use strict';

/**
 * main_mainevma.js
 *
 * Entry point. Orchestrates:
 *   1. Run the crawl
 *   2. Save JSONL
 *   3. Save CSV
 *   4. Log sample
 *
 * Run: node main_mainevma.js
 */

const fs   = require('fs');
const path = require('path');

const { crawlDirectory } = require('./src/processors/urlProcessor_mainevma');
const logger             = require('./src/utils/logger');
const config             = require('./config');

// ── Save helpers ──────────────────────────────────────────────────────────────

function saveJsonl(members, filePath) {
  const lines = members.map(m => JSON.stringify(m)).join('\n');
  fs.writeFileSync(filePath, lines + '\n', 'utf8');
  logger.info(`[main] JSONL saved → ${filePath} (${members.length} records)`);
}

function saveCsv(members, filePath) {
  if (members.length === 0) {
    fs.writeFileSync(filePath, '', 'utf8');
    logger.warn('[main] CSV written but empty — no members collected');
    return;
  }

  // Build header from union of all keys across all records
  const allKeys = [...new Set(members.flatMap(m => Object.keys(m)))];

  const escape = (val) => {
    if (val == null) return '';
    const s = Array.isArray(val)
      ? JSON.stringify(val)           // keep arrays as stringified JSON in one cell
      : String(val);
    const escaped = s.replace(/"/g, '""');
    return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
      ? `"${escaped}"`
      : escaped;
  };

  const header = allKeys.join(',');
  const rows   = members.map(m => allKeys.map(k => escape(m[k])).join(','));

  fs.writeFileSync(filePath, [header, ...rows].join('\n') + '\n', 'utf8');
  logger.info(`[main] CSV saved → ${filePath} (${members.length} records)`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

(async () => {
  try {
    logger.info('[main] Starting Maine VMA scraper...');

    const members = await crawlDirectory();

    logger.info(`[main] Crawl complete — ${members.length} unique members collected`);

    if (members.length === 0) {
      logger.warn('[main] No members found — check parser selectors or site availability');
      process.exit(0);
    }

    // Resolve output dir relative to THIS file, not cwd
    const outDir = path.resolve(__dirname, config.output.dir);
    fs.mkdirSync(outDir, { recursive: true });

    const jsonlPath = path.join(outDir, config.output.jsonlFile);
    const csvPath   = path.join(outDir, config.output.csvFile);

    saveJsonl(members, jsonlPath);
    saveCsv(members, csvPath);

    // Log sample
    const sample = members.slice(0, config.output.sampleSize ?? 5);
    logger.info('[main] Sample records:');
    sample.forEach((m, i) =>
      logger.info(`  [${i + 1}] ${m.fullName || '(no name)'} | ${m.profileEmail || m.companyEmail || '(no email)'} | ${m.companyName || ''}`)
    );

    logger.info('[main] Done ✅');

  } catch (err) {
    logger.error('[main] Fatal error', { message: err.message, stack: err.stack });
    process.exit(1);
  }
})();