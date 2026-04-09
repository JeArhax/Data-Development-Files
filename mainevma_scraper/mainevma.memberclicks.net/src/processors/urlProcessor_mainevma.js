'use strict';

/**
 * urlProcessor_mainevma.js
 *
 * Crawl logic only. Exports crawlDirectory().
 * main_mainevma.js is the entry point.
 *
 * Key fix: dedup key now uses profileId as primary key (always unique),
 * falling back to companyName|email only when profileId is absent.
 * A running counter prevents blank cards from colliding with each other.
 */

const { launchBrowser, loadDirectoryPage, clickNextPage } = require('../services/mainevma/client');
const { parseDomCards, parsePaginationInfo }              = require('../parsers/mainevma/parsers');
const { withRetry, timeWaitFor }                          = require('../utils/async');
const logger = require('../utils/logger');
const config = require('../../config');

async function crawlDirectory() {
  let browser    = null;
  const allMembers = [];
  const seenKeys   = new Set();
  let   blankCount = 0;

  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    // ── Page 1 ──────────────────────────────────────────────────────────────
    const { pageContent } = await withRetry(
      () => loadDirectoryPage(page),
      config.crawl.maxRetries,
      config.crawl.retryBaseDelay,
      'loadDirectoryPage'
    );

    const info = parsePaginationInfo(pageContent);
    if (info.totalMembers) {
      logger.info(
        `[processor] ${info.totalMembers} total members ` +
        `(~${Math.ceil(info.totalMembers / 10)} pages)`
      );
    }

    const page1 = parseDomCards(pageContent);
    blankCount  = addUnique(page1, allMembers, seenKeys, blankCount);
    logger.info(`[processor] Page 1 → ${page1.length} members (total: ${allMembers.length})`);

    // ── Pagination loop ──────────────────────────────────────────────────────
    for (let pageNum = 2; pageNum <= 200; pageNum++) {
      const clicked = await withRetry(
        () => clickNextPage(page),
        config.crawl.maxRetries,
        config.crawl.retryBaseDelay,
        `clickNext page=${pageNum}`
      );

      if (!clicked) {
        logger.info(`[processor] Pagination complete after ${pageNum - 1} page(s)`);
        break;
      }

      const content = await page.content();
      const members = parseDomCards(content);

      if (members.length === 0) {
        logger.warn(`[processor] Page ${pageNum} returned 0 members — stopping`);
        break;
      }

      blankCount = addUnique(members, allMembers, seenKeys, blankCount);
      logger.info(
        `[processor] Page ${pageNum} → ${members.length} members (total: ${allMembers.length})`
      );

      await timeWaitFor(config.crawl.pageDelay);
    }

    return allMembers;

  } finally {
    if (browser) {
      await browser.close();
      logger.info('[processor] Browser closed');
    }
  }
}

/**
 * Key priority:
 *   1. profileId         → always unique
 *   2. companyName|email → if either is meaningful
 *   3. blank-N counter   → fully empty cards never collide
 */
function addUnique(newMembers, allMembers, seenKeys, blankCount) {
  for (const m of newMembers) {
    let key;

    if (m.profileId) {
      key = `id:${m.profileId}`;
    } else {
      const name  = (m.companyName  || '').toLowerCase().trim();
      const email = (m.profileEmail || '').toLowerCase().trim();
      key = (name || email) ? `${name}|${email}` : `blank:${blankCount++}`;
    }

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allMembers.push(m);
    } else {
      logger.debug('[processor] Skipping duplicate', { key });
    }
  }
  return blankCount;
}

module.exports = { crawlDirectory };