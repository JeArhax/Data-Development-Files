'use strict';

/**
 * client.js — msvet.org
 *
 * The directory results live inside an iframe: #SearchResultsFrame
 * We use Playwright's frameLocator() to pierce it.
 *
 * Phase 1 — Directory listing:
 *   - Load the main page, reload to get full session
 *   - Pierce #SearchResultsFrame with frameLocator
 *   - Wait for results inside the iframe
 *   - Paginate via __doPostBack buttons inside the iframe
 *
 * Phase 2 — Profile pages:
 *   - Navigate to https://msvet.org/members/?id={profileId}
 */

const { chromium } = require('playwright');
const { timeWaitFor } = require('../../utils/async');
const logger = require('../../utils/loggers');
const config = require('../../config');

let _browser = null;
let _page    = null;
let _frame   = null;  // frameLocator for the iframe

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: config.PLAYWRIGHT_HEADLESS,
      slowMo:   config.PLAYWRIGHT_SLOW_MO,
    });
    logger.info('[client] Chromium launched');
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
    _page    = null;
    _frame   = null;
    logger.info('[client] Browser closed');
  }
}

// ── Phase 1: Directory ────────────────────────────────────────────────────────

async function openDirectory() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  _page = await context.newPage();

  logger.info(`[client] Navigating to ${config.SOURCE_URL}`);
  await _page.goto(config.SOURCE_URL, {
    waitUntil: 'domcontentloaded',
    timeout:   config.PAGE_LOAD_TIMEOUT,
  });

  // Reload to ensure ASP.NET session is fully initialized
  logger.info('[client] Reloading for full session init...');
  await _page.reload({ waitUntil: 'domcontentloaded', timeout: config.PAGE_LOAD_TIMEOUT });
  await timeWaitFor(config.RENDER_WAIT);

  // Pierce the iframe
  _frame = _page.frameLocator('#SearchResultsFrame');

  // Wait for results inside the iframe
  logger.info('[client] Waiting for results inside iframe...');
  try {
    await _frame.locator('#search-results').waitFor({ timeout: config.PAGE_LOAD_TIMEOUT });
  } catch {
    await _page.screenshot({ path: 'debug_msvet_load.png', fullPage: true });
    throw new Error('Could not find #search-results inside iframe — check debug_msvet_load.png');
  }

  await timeWaitFor(1000);

  // Log total count
  try {
    const count = await _frame.locator('#DocCount').innerText();
    logger.info(`[client] Directory loaded — ${count} records found`);
  } catch {
    logger.warn('[client] Could not read record count — continuing');
  }

  return _page;
}

async function getPageItems() {
  if (!_frame) throw new Error('[client] Frame not open — call openDirectory() first');
  const items = await _frame.locator('#search-results li div.memb-result-item').all();
  return await Promise.all(items.map(el => el.innerHTML()));
}

async function getPageInfo() {
  if (!_frame) return null;
  try {
    const text = await _frame.locator('#page-counter span').innerText();
    const m = text.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
    if (m) return { current: +m[1], total: +m[2], raw: text.trim() };
    return { raw: text.trim() };
  } catch {
    return null;
  }
}

/**
 * Click the → Next button inside the iframe.
 * ASP.NET __doPostBack reloads the iframe content (not the whole page).
 */
async function goNextPage() {
  if (!_frame) throw new Error('[client] Frame not open');

  // Get current page number
  const pageInfo = await getPageInfo();
  if (!pageInfo || !pageInfo.current || !pageInfo.total) {
    logger.warn('[client] Could not read page info — stopping');
    return false;
  }
  if (pageInfo.current >= pageInfo.total) {
    logger.info(`[client] On last page (${pageInfo.current} of ${pageInfo.total})`);
    return false;
  }

  const nextPageNum = pageInfo.current + 1;

  // Snapshot first name to detect change
  const beforeName = await _frame.locator('p.name a.normalName').first().innerText().catch(() => '');

  // Try clicking the numbered button first (visible when next page is in current set)
  const numberedBtn = _frame.locator(`div.btn-group button:has-text("${nextPageNum}")`).first();
  const numberedCount = await numberedBtn.count();

  if (numberedCount > 0) {
    logger.info(`[client] Clicking page ${nextPageNum} button`);
    await numberedBtn.click();
  } else {
    // Next page number not visible — click the → arrow to advance the page window
    logger.info(`[client] Page ${nextPageNum} not visible — clicking → arrow`);
    const arrowBtn = _frame.locator('div.btn-group button:has(i.fa-arrow-right)');
    const arrowCount = await arrowBtn.count();
    if (!arrowCount) {
      logger.info('[client] No arrow button found — last page reached');
      return false;
    }
    await arrowBtn.click();
  }

  // Wait for iframe content to update (ASP.NET postback reloads iframe)
  await timeWaitFor(2000);

  // Wait for results to reappear
  await _frame.locator('#search-results').waitFor({ timeout: config.PAGE_LOAD_TIMEOUT });
  await timeWaitFor(500);

  // Verify page actually changed
  const afterName = await _frame.locator('p.name a.normalName').first().innerText().catch(() => '');
  if (afterName === beforeName) {
    logger.warn('[client] First name unchanged after Next — assuming last page');
    return false;
  }

  await timeWaitFor(config.PAGE_DELAY);
  return true;
}

// ── Phase 2: Profile pages ────────────────────────────────────────────────────

async function getProfileHtml(profileId) {
  if (!_page) throw new Error('[client] Page not open');
  const url = `${config.PROFILE_URL}${profileId}`;
  try {
    await _page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout:   config.PAGE_LOAD_TIMEOUT,
    });
    await timeWaitFor(500);
    return await _page.content();
  } catch (err) {
    logger.warn(`[client] Failed to load profile ${profileId}`, { error: err.message });
    return null;
  }
}

module.exports = {
  getBrowser, closeBrowser,
  openDirectory, getPageItems, getPageInfo, goNextPage,
  getProfileHtml,
};