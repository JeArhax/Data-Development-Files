'use strict';

/**
 * client.js — members.nysvms.org (New York State VMS)
 *
 * Novi AMS Map View directory:
 *   - Cards in sidebar: div.c-directory-map-view-member-badge
 *   - Member ID from: div[data-member-id]
 *   - Pagination: a.next (KnockoutJS, same as massvet)
 *   - Profile URLs: /hospitals/{slug}
 *
 * No search button needed — results load on page load.
 */

const { chromium } = require('playwright');
const { timeWaitFor } = require('../../utils/async');
const logger = require('../../utils/loggers');
const config = require('../../../config');

async function launchBrowser() {
  const browser = await chromium.launch({ headless: config.PLAYWRIGHT_HEADLESS ?? false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  return { browser, page };
}

async function loadDirectoryPage(page) {
  logger.info('[client] Navigating to directory...');
  await page.goto(config.SOURCE_URL, {
    waitUntil: 'networkidle',
    timeout:   config.PAGE_LOAD_TIMEOUT,
  });
  await timeWaitFor(config.RENDER_WAIT);

  // Wait for member cards in the map view sidebar
  await page.waitForSelector('#members-container div[data-member-id]', {
    timeout: config.PAGE_LOAD_TIMEOUT,
  });
  await timeWaitFor(1000);

  // Log total count
  try {
    const countEl = await page.$('.sr-only[role="status"]');
    if (countEl) {
      const t = await countEl.innerText();
      logger.info(`[client] ${t.trim()}`);
    }
  } catch { /* ok */ }

  return { pageContent: await page.content() };
}

/**
 * Click the Novi AMS "Next" pagination link.
 * Same KnockoutJS a.next pattern as massvet.
 */
async function clickNextPage(page) {
  const hasNext = await page.evaluate(() => {
    const next = document.querySelector('a.next');
    if (!next) return false;
    const style = window.getComputedStyle(next);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });

  if (!hasNext) {
    logger.info('[client] No Next link — end of pagination');
    return false;
  }

  // Snapshot first member name to detect page change
  const beforeName = await page.evaluate(() => {
    const el = document.querySelector('.c-directory-map-view-member-badge__info-name');
    return el ? el.innerText.trim() : '';
  });

  await page.evaluate(() => {
    const next = document.querySelector('a.next');
    if (next) next.click();
  });

  // Wait for cards to change
  try {
    await page.waitForFunction(
      (before) => {
        const el = document.querySelector('.c-directory-map-view-member-badge__info-name');
        return el && el.innerText.trim() !== before;
      },
      beforeName,
      { timeout: 15000 }
    );
  } catch {
    logger.warn('[client] Cards did not change after Next — assuming last page');
    return false;
  }

  await timeWaitFor(500);
  return true;
}

/**
 * Load a profile page and return its HTML.
 * Profile URLs are slugs like /hospitals/pathways-animal-hospital
 */
async function scrapeProfilePage(page, profilePath) {
  const url = `${config.PROFILE_BASE}${profilePath}`;
  try {
      await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout:   config.PAGE_LOAD_TIMEOUT,
    });
    await timeWaitFor(1000);
    return await page.content();
  } catch (err) {
    logger.warn(`[client] Failed to load profile ${url}`, { error: err.message });
    return null;
  }
}
async function screenshotPage(page, name) {
  const file = `debug_${name}_${Date.now()}.png`;
  await page.screenshot({ path: file, fullPage: true });
  logger.info(`[client] Screenshot → ${file}`);
}

module.exports = { launchBrowser, loadDirectoryPage, clickNextPage, scrapeProfilePage, screenshotPage };