'use strict';

/**
 * client.js — massvet.org (Novi AMS)
 *
 * From inspecting the actual HTML:
 * - Cards: div.member.c-member-badge inside #members-container
 * - Search trigger: #search-go (the arrow button next to search box)
 * - List view is already active by default on this page
 * - Next: <a class="next"> — only rendered when PageNumber < PageCount
 * - Profile URLs: /find-a-veterinarian-directory/{slug}
 */

const { chromium } = require('playwright');
const { timeWaitFor } = require('../../utils/async');
const logger = require('../../utils/logger');
const config = require('../../../config');

async function launchBrowser() {
  const browser = await chromium.launch({ headless: config.browser.headless ?? false });
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

  // Wait for Novi AMS JS to bootstrap
  await timeWaitFor(3000);

  // Trigger search (empty = all results) via the #search-go button
  logger.info('[client] Triggering search...');
  await page.evaluate(() => {
    const btn = document.getElementById('search-go');
    if (btn) btn.click();
  });

  // Wait for member cards to appear
  await page.waitForSelector('.member.c-member-badge', {
    timeout: config.browser.pageLoadTimeout,
  });
  await timeWaitFor(1500);

  logger.info('[client] Directory loaded');
  const pageContent = await page.content();
  return { pageContent };
}

/**
 * Click the Novi AMS "Next" pagination link.
 * The link only exists in DOM when there are more pages (KO binding).
 */
async function clickNextPage(page) {
  const hasNext = await page.evaluate(() => {
    const next = document.querySelector('a.next');
    if (!next) return false;
    const style = window.getComputedStyle(next);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    // Novi hides the prev/next via KO data-bind — if it's in DOM and visible, it's clickable
    return true;
  });

  if (!hasNext) {
    logger.info('[client] No Next link — end of pagination');
    return false;
  }

  // Snapshot first card name to detect page change
  const beforeName = await page.evaluate(() => {
    const el = document.querySelector('.c-member-badge__name');
    return el ? el.innerText.trim() : '';
  });

  await page.evaluate(() => {
    const next = document.querySelector('a.next');
    if (next) next.click();
  });

  // Wait for first card name to change
  try {
    await page.waitForFunction(
      (before) => {
        const el = document.querySelector('.c-member-badge__name');
        return el && el.innerText.trim() !== before;
      },
      beforeName,
      { timeout: 15000 }
    );
  } catch {
    logger.warn('[client] Cards did not change after Next click — assuming last page');
    return false;
  }

  await timeWaitFor(500);
  return true;
}

/**
 * Scrape a single profile page for full detail.
 * Returns object with all available fields.
 */
async function scrapeProfilePage(page, profileUrl) {
  try {
    await page.goto(profileUrl, {
      waitUntil: 'networkidle',
      timeout:   config.browser.pageLoadTimeout,
    });
    await timeWaitFor(1000);
    const html = await page.content();
    return html;
  } catch (err) {
    logger.warn('[client] Failed to load profile page', { url: profileUrl, error: err.message });
    return null;
  }
}

async function screenshotPage(page, name) {
  const file = `debug_${name}_${Date.now()}.png`;
  await page.screenshot({ path: file, fullPage: true });
  logger.info(`[client] Screenshot → ${file}`);
}

module.exports = { launchBrowser, loadDirectoryPage, clickNextPage, scrapeProfilePage, screenshotPage };