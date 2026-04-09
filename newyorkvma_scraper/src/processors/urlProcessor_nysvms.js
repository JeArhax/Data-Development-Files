'use strict';

const fs   = require('fs');
const path = require('path');

const { launchBrowser, loadDirectoryPage, clickNextPage, scrapeProfilePage, screenshotPage } = require('../services/nysvms.org/client');
const { parseDomCards, parseProfilePage, parsePaginationInfo } = require('../parsers/parsers');
const { timeWaitFor } = require('../utils/async');
const logger = require('../utils/loggers');
const config = require('../../config');

const MAX_PAGES = 200;
 
// ── Phase 1: Crawl directory ──────────────────────────────────────────────────
 
async function crawlDirectory() {
  let browser    = null;
  const allMembers = [];
  const seenKeys   = new Set();
  let   blankCount = 0;
 
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;
 
    const { pageContent } = await loadDirectoryPage(page);
 
    const info = parsePaginationInfo(pageContent);
    if (info.totalMembers) logger.info(`[processor] ~${info.totalMembers} total hospitals`);
 
    const page1 = parseDomCards(pageContent);
    if (page1.length === 0) {
      await screenshotPage(page, 'debug_page1').catch(() => {});
      logger.warn('[processor] Page 1 returned 0 cards — screenshot saved');
    }
    blankCount = addUnique(page1, allMembers, seenKeys, blankCount);
    logger.info(`[processor] Page 1 → ${page1.length} cards (total: ${allMembers.length})`);
 
    for (let pageNum = 2; pageNum <= MAX_PAGES; pageNum++) {
      const clicked = await clickNextPage(page);
      if (!clicked) {
        logger.info(`[processor] Pagination complete after ${pageNum - 1} page(s)`);
        break;
      }
 
      const content = await page.content();
      const members = parseDomCards(content);
 
      if (members.length === 0) {
        logger.warn(`[processor] Page ${pageNum} returned 0 cards — stopping`);
        break;
      }
 
      blankCount = addUnique(members, allMembers, seenKeys, blankCount);
      logger.info(`[processor] Page ${pageNum} → ${members.length} cards (total: ${allMembers.length})`);
      await timeWaitFor(config.CRAWL_PAGE_DELAY);
    }
 
    // ── Save Phase 1 results immediately ─────────────────────────────────────
    const outDir = path.resolve(path.dirname(path.dirname(__dirname)), config.OUTPUT_DIR);
    fs.mkdirSync(outDir, { recursive: true });
    const phase1Path = path.join(outDir, `${config.OUTPUT_PREFIX}_phase1.jsonl`);
    saveJsonl(allMembers, phase1Path);
    logger.info(`[processor] Phase 1 saved → ${phase1Path}`);
 
    // ── Phase 2: Profile enrichment ───────────────────────────────────────────
    if (process.env.SKIP_PROFILES !== '1') {
      logger.info(`[processor] Scraping ${allMembers.length} profile pages...`);
 
      for (let i = 0; i < allMembers.length; i++) {
        const member = allMembers[i];
        if (!member.profilePath) continue;
 
        if ((i + 1) % 50 === 0) {
          logger.info(`[processor] Progress: ${i + 1}/${allMembers.length} profiles done`);
        } else {
          logger.info(`[processor] Profile ${i + 1}/${allMembers.length}: ${member.companyName}`);
        }
 
        const html = await scrapeProfilePage(page, member.profilePath).catch(err => {
          logger.warn('[processor] Profile failed', { name: member.companyName, error: err.message });
          return null;
        });
 
        parseProfilePage(html, member);
        await timeWaitFor(config.PROFILE_DELAY);
 
        // Save checkpoint every 100 profiles
        if ((i + 1) % 100 === 0) {
          const checkpointPath = path.join(outDir, `${config.OUTPUT_PREFIX}_checkpoint_${i + 1}.jsonl`);
          saveJsonl(allMembers, checkpointPath);
          logger.info(`[processor] Checkpoint saved → ${checkpointPath}`);
        }
      }
    }
 
    logger.info(`[processor] Done — ${allMembers.length} hospitals collected`);
    return allMembers;
 
  } finally {
    if (browser) {
      await browser.close();
      logger.info('[processor] Browser closed');
    }
  }
}
 
function addUnique(newMembers, allMembers, seenKeys, blankCount) {
  for (const m of newMembers) {
    let key;
    if (m.memberId)         key = `id:${m.memberId}`;
    else if (m.profilePath) key = `path:${m.profilePath}`;
    else                    key = `blank:${blankCount++}`;
 
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allMembers.push(m);
    } else {
      logger.debug('[processor] Duplicate skipped', { key });
    }
  }
  return blankCount;
}
 
// ── Save helpers ──────────────────────────────────────────────────────────────
 
function saveJsonl(members, filePath) {
  fs.writeFileSync(filePath, members.map(m => JSON.stringify(m)).join('\n') + '\n', 'utf8');
  logger.info(`[processor] JSONL → ${filePath} (${members.length} records)`);
}
 
function saveCsv(members, filePath) {
  if (!members.length) return;
  const allKeys = [...new Set(members.flatMap(m => Object.keys(m)))];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    const e = s.replace(/"/g, '""');
    return e.includes(',') || e.includes('"') || e.includes('\n') ? `"${e}"` : e;
  };
  const rows = members.map(m => allKeys.map(k => esc(m[k])).join(','));
  fs.writeFileSync(filePath, [allKeys.join(','), ...rows].join('\n') + '\n', 'utf8');
  logger.info(`[processor] CSV → ${filePath} (${members.length} records)`);
}
 
module.exports = { crawlDirectory, saveJsonl, saveCsv };
 