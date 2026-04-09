'use strict';

/**
 * urlProcessor_massvet.js
 * Crawl logic only — exports crawlDirectory().
 *
 * Flow:
 *   1. Load directory listing page
 *   2. Parse all cards per page (name, org, phone, website, membership type)
 *   3. For each card, visit the profile page for full detail
 *   4. Paginate until no Next link
 */

const {
  launchBrowser, loadDirectoryPage, clickNextPage,
  scrapeProfilePage, screenshotPage,
} = require('../services/massvet/client');
const { parseDomCards, parseProfilePage, parsePaginationInfo } = require('../parsers/parsers');
const { withRetry, timeWaitFor } = require('../utils/async');
const logger = require('../utils/logger');
const config = require('../../config');

const MAX_PAGES = 200;

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
      logger.info(`[processor] ~${info.totalMembers} total members`);
    }

    const page1 = parseDomCards(pageContent);
    if (page1.length === 0) {
      await screenshotPage(page, 'debug_page1').catch(() => {});
      logger.warn('[processor] Page 1 returned 0 members — screenshot saved');
    }

    blankCount = addUnique(page1, allMembers, seenKeys, blankCount);
    logger.info(`[processor] Page 1 → ${page1.length} cards (total: ${allMembers.length})`);

    // ── Pagination ───────────────────────────────────────────────────────────
    for (let pageNum = 2; pageNum <= MAX_PAGES; pageNum++) {
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
      logger.info(`[processor] Page ${pageNum} → ${members.length} cards (total: ${allMembers.length})`);
      await timeWaitFor(config.crawl.pageDelay);
    }

    // ── Profile scraping ─────────────────────────────────────────────────────
    logger.info(`[processor] Scraping ${allMembers.length} profile pages...`);

    for (let i = 0; i < allMembers.length; i++) {
      const member = allMembers[i];

      if (!member.profilePageUrl) {
        logger.debug(`[processor] No profile URL for ${member.fullName} — skipping`);
        continue;
      }

      logger.info(`[processor] Profile ${i + 1}/${allMembers.length}: ${member.fullName || member.companyName}`);

      const profileHtml = await withRetry(
        () => scrapeProfilePage(page, member.profilePageUrl),
        config.crawl.maxRetries,
        config.crawl.retryBaseDelay,
        `profile:${member.profilePageUrl}`
      ).catch((err) => {
        logger.warn('[processor] Profile scrape failed', { url: member.profilePageUrl, error: err.message });
        return null;
      });

      parseProfilePage(profileHtml, member);
      await timeWaitFor(config.crawl.profileDelay || 800);
    }

    logger.info(`[processor] Done — ${allMembers.length} members with full profiles`);
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
    if (m.profileId) {
      key = `id:${m.profileId}`;
    } else if (m.profilePageUrl) {
      key = `url:${m.profilePageUrl}`;
    } else {
      const name = (m.fullName || m.companyName || '').toLowerCase().trim();
      key = name || `blank:${blankCount++}`;
    }

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allMembers.push(m);
    } else {
      logger.debug('[processor] Duplicate skipped', { key });
    }
  }
  return blankCount;
}

module.exports = { crawlDirectory };