'use strict';

/**
 * client.js — Maine VMA (mainevma.memberclicks.net)
 *
 * The directory uses an Angular Material app with a search form.
 * Cards only appear AFTER clicking the Search button (empty = all members).
 * Pagination uses mat-paginator with aria-label="Next page".
 */

const { chromium } = require('playwright');
const { timeWaitFor } = require('../../utils/async');
const logger = require('../../utils/logger');
const config = require('../../../config');

async function launchBrowser() {
  const browser = await chromium.launch({
    channel:  config.browser.channel || undefined,
    headless: config.browser.headless ?? true,
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  return { browser, page };
}

async function loadDirectoryPage(page) {
  logger.info('[client] Navigating to directory...');
  await page.goto(config.source.directoryUrl, {
    waitUntil: 'networkidle',
    timeout:   config.browser.pageLoadTimeout,
  });

  // Wait for Angular app to bootstrap
  await timeWaitFor(3000);

  // Click the Search button — empty search returns all members
  // The submit button is an <sl-button type="submit"> (Shoelace web component)
  logger.info('[client] Clicking Search button...');
  const clicked = await page.evaluate(() => {
    // Try native button first
    const btn = document.querySelector('sl-button[type="submit"]')
              || document.querySelector('button[type="submit"]');
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (clicked) {
    logger.info('[client] Search clicked — waiting for cards...');
  } else {
    logger.warn('[client] Search button not found — attempting to continue');
  }

  // Wait for at least one card to appear
  await page.waitForSelector('.card', {
    timeout: config.browser.pageLoadTimeout,
  });
  await timeWaitFor(1000);

  logger.info('[client] Cards loaded');
  const pageContent = await page.content();
  return { interceptedResponses: [], pageContent };
}

/**
 * Click the Angular Material "Next page" button.
 * Returns true if clicked and new page rendered, false if end of pagination.
 */
async function clickNextPage(page) {
  const nextBtn = await page.$('button[aria-label="Next page"]');

  if (!nextBtn) {
    logger.info('[client] Next page button not found — end of pagination');
    return false;
  }

  const isDisabled = await nextBtn.getAttribute('disabled');
  if (isDisabled !== null) {
    logger.info('[client] Next page button is disabled — end of pagination');
    return false;
  }

  // Snapshot first card so we can detect when page actually changes
  const beforeContent = await page.$eval('.card', el => el.innerHTML).catch(() => '');

  await nextBtn.click();

  // Wait for first card content to change (Angular re-renders)
  try {
    await page.waitForFunction(
      (before) => {
        const first = document.querySelector('.card');
        return first && first.innerHTML !== before;
      },
      beforeContent,
      { timeout: 15_000 }
    );
  } catch {
    logger.warn('[client] Cards did not change after Next click — assuming last page');
    return false;
  }

  await timeWaitFor(500);
  return true;
}

async function screenshotPage(page, name) {
  const file = `debug_${name}_${Date.now()}.png`;
  await page.screenshot({ path: file, fullPage: true });
  logger.info(`[client] Screenshot saved: ${file}`);
}

module.exports = { launchBrowser, loadDirectoryPage, clickNextPage, screenshotPage };