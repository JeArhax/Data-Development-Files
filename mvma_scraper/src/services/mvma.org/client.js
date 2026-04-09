'use strict';

const config = require('../../config');
const logger = require('../../utils/loggers');
const { NetworkError } = require('../../utils/errors');
const { timeWaitFor }  = require('../../utils/async');

let _browser = null;
let _page    = null;

// ── Browser lifecycle ─────────────────────────────────────────────────────────

async function getBrowser() {
  if (!_browser) {
    const { chromium } = require('playwright');
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
    logger.info('[client] Browser closed');
  }
}

// ── Directory page ────────────────────────────────────────────────────────────

async function openDirectory() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  _page = await context.newPage();

  logger.info(`[client] Navigating to ${config.SOURCE_URL}`);
  try {
    await _page.goto(config.SOURCE_URL, {
      waitUntil: 'networkidle',
      timeout:   config.PAGE_LOAD_TIMEOUT,
    });
  } catch (err) {
    throw new NetworkError(`Failed to load ${config.SOURCE_URL}: ${err.message}`);
  }

  // Wait for Angular app to fully bootstrap
  await timeWaitFor(3000);

  // Click the Search button — empty search returns all members.
  // The button is an <sl-button type="submit"> (Shoelace web component).
  // We use evaluate() because Playwright's .click() doesn't pierce
  // Shoelace's shadow DOM reliably.
  logger.info('[client] Clicking Search button...');
  const clicked = await _page.evaluate(() => {
    const btn = document.querySelector('sl-button[type="submit"]')
             || document.querySelector('button[type="submit"]');
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (!clicked) {
    logger.warn('[client] Search button not found — cards may not load');
  } else {
    logger.info('[client] Search clicked — waiting for cards...');
  }

  // Wait for Angular to render the first batch of cards
  try {
    await _page.waitForSelector(config.SELECTORS.card, { timeout: config.PAGE_LOAD_TIMEOUT });
  } catch {
    throw new NetworkError(
      'Timed out waiting for directory cards to appear after clicking Search. ' +
      'Try running with --headful to debug visually.'
    );
  }

  // Extra settle time for Angular hydration
  await timeWaitFor(config.RENDER_WAIT);

  // Log the total count for reference
  try {
    const countText = await _page.locator(config.SELECTORS.resultCount).innerText();
    logger.info(`[client] Directory loaded. ${countText.trim()}`);
  } catch {
    logger.warn('[client] Could not read result count — continuing anyway');
  }

  return _page;
}

// ── Per-page data extraction ──────────────────────────────────────────────────

async function getPageCards() {
  if (!_page) throw new Error('[client] Page not open — call openDirectory() first');

  try {
    const cards = await _page.locator(config.SELECTORS.card).all();
    const htmlChunks = await Promise.all(cards.map((c) => c.innerHTML()));
    return htmlChunks;
  } catch (err) {
    throw new NetworkError(`getPageCards failed: ${err.message}`);
  }
}

async function getPaginatorInfo() {
  if (!_page) return null;
  try {
    const label = await _page.locator('.mat-mdc-paginator-range-label').innerText();
    const match = label.match(/(\d+)\s*[–-]\s*(\d+)\s*of\s*(\d+)/);
    if (match) {
      return { from: +match[1], to: +match[2], total: +match[3], raw: label.trim() };
    }
    return { raw: label.trim() };
  } catch {
    return null;
  }
}

async function goNextPage() {
  if (!_page) throw new Error('[client] Page not open');

  const nextBtn = _page.locator(config.SELECTORS.nextButton);

  const isDisabled = await nextBtn.getAttribute('disabled');
  if (isDisabled !== null) {
    logger.info('[client] Next button is disabled — last page reached');
    return false;
  }

  let oldFirstCard = '';
  try {
    oldFirstCard = await _page.locator(config.SELECTORS.card).first()
      .locator(config.SELECTORS.name).innerText();
  } catch { /* ok */ }

  await nextBtn.click();

  try {
    await _page.waitForFunction(
      ([sel, nameClass, old]) => {
        const first = document.querySelector(sel);
        if (!first) return false;
        const nameEl = first.querySelector(nameClass);
        return nameEl && nameEl.innerText.trim() !== old;
      },
      [config.SELECTORS.card, config.SELECTORS.name, oldFirstCard],
      { timeout: config.NAVIGATION_TIMEOUT }
    );
  } catch {
    logger.warn('[client] waitForFunction timed out on page turn — using fixed delay');
    await timeWaitFor(config.RENDER_WAIT * 2);
  }

  await timeWaitFor(config.DELAY_BETWEEN_PAGES);
  return true;
}

module.exports = { getBrowser, openDirectory, getPageCards, getPaginatorInfo, goNextPage, closeBrowser };