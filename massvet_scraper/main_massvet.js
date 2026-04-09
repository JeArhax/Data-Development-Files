'use strict';

/**
 * main_massvet.js — Entry point
 * Run: node main_massvet.js
 */

const fs   = require('fs');
const path = require('path');

const { crawlDirectory } = require('./src/processors/urlProcessor_massvet');
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
    logger.warn('[main] CSV empty — no members collected');
    return;
  }

  const allKeys = [...new Set(members.flatMap(m => Object.keys(m)))];

  const escape = (val) => {
    if (val == null) return '';
    const s = Array.isArray(val) ? JSON.stringify(val) : String(val);
    const e = s.replace(/"/g, '""');
    return e.includes(',') || e.includes('"') || e.includes('\n') ? `"${e}"` : e;
  };

  const rows = members.map(m => allKeys.map(k => escape(m[k])).join(','));
  fs.writeFileSync(filePath, [allKeys.join(','), ...rows].join('\n') + '\n', 'utf8');
  logger.info(`[main] CSV saved → ${filePath} (${members.length} records)`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

(async () => {
  try {
    logger.info('[main] Starting Massachusetts VMA scraper...');

    const members = await crawlDirectory();
    logger.info(`[main] Crawl complete — ${members.length} unique members`);

    if (members.length === 0) {
      logger.warn('[main] No members collected — check parser selectors');
      process.exit(0);
    }

    const outDir = path.resolve(__dirname, config.output.dir);
    fs.mkdirSync(outDir, { recursive: true });

    saveJsonl(members, path.join(outDir, config.output.jsonlFile));
    saveCsv(members,   path.join(outDir, config.output.csvFile));

    const sample = members.slice(0, config.output.sampleSize ?? 5);
    logger.info('[main] Sample:');
    sample.forEach((m, i) =>
      logger.info(`  [${i + 1}] ${m.fullName || '(no name)'} | ${m.profileEmail || '(no email)'} | ${m.companyName || ''}`)
    );

    logger.info('[main] Done ✅');
  } catch (err) {
    logger.error('[main] Fatal error', { message: err.message, stack: err.stack });
    process.exit(1);
  }
})();
