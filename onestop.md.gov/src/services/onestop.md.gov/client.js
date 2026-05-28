/**
 * services/onestop.md.gov/client.js
 * Browser automation client using Puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../utils/loggers');
const { sleep } = require('../../utils/async');

const URL_CACHE_FILE = path.join(__dirname, '../../../no-sync/output/url_cache_onestop.md.gov.json');

const saveUrlCache = (newEntries) => {
  const dir = path.dirname(URL_CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Merge with existing cache — no duplicates by currentPageUrl
  let existing = [];
  if (fs.existsSync(URL_CACHE_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(URL_CACHE_FILE, 'utf8')); } catch (e) {}
  }
  const existingUrls = new Set(existing.map(e => e.currentPageUrl));
  const merged = [...existing, ...newEntries.filter(e => !existingUrls.has(e.currentPageUrl))];
  fs.writeFileSync(URL_CACHE_FILE, JSON.stringify(merged, null, 2));
};

const loadUrlCache = () => {
  if (!fs.existsSync(URL_CACHE_FILE)) return null;
  try {
    const entries = JSON.parse(fs.readFileSync(URL_CACHE_FILE, 'utf8'));
    logger.info(`URL cache found — ${entries.length} URLs loaded from cache, skipping scroll.`);
    return entries;
  } catch (e) {
    logger.warn('URL cache corrupted, re-scrolling.');
    return null;
  }
};

let browser = null;
let listPage = null;
let detailPage = null;

const launch = async () => {
  logger.info('Launching Puppeteer browser...');
  browser = await puppeteer.launch({
    headless: config.crawl.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  listPage  = await browser.newPage();
  detailPage = await browser.newPage();
  await listPage.setViewport({ width: 1280, height: 900 });
  await detailPage.setViewport({ width: 1280, height: 900 });
  logger.success('Browser launched.');
};

const close = async () => {
  if (browser) await browser.close();
  logger.info('Browser closed.');
};

/**
 * Load the listing page and wait for rows (allows manual captcha solve)
 */
const loadListPage = async () => {
  logger.info(`Navigating to list page: ${config.source.listUrl}`);
  logger.warn('NOTE: If a captcha appears, solve it manually in the browser window.');

  await listPage.goto(config.source.listUrl, {
    waitUntil: 'networkidle2',
    timeout: config.crawl.pageLoadTimeout,
  });

  logger.info('Waiting for table rows to appear...');
  await listPage.waitForSelector('.list-view-record', {
    timeout: config.crawl.pageLoadTimeout,
  });
  logger.success('List page loaded and rows visible.');
};

/**
 * Scroll the list until all records are loaded via infinite scroll
 */
const scrollUntilAllLoaded = async () => {
  logger.info(`Scrolling to load all ${config.crawl.totalExpected} records...`);
  let previousCount = 0;
  let stableRounds = 0;
  let scrollCount = 0;

  while (true) {
    const count = await listPage.evaluate(() =>
      document.querySelectorAll('.list-view-record').length
    );

    logger.info(`  Scroll #${scrollCount} — Records: ${count} / ${config.crawl.totalExpected}`);

    if (count >= config.crawl.totalExpected) {
      logger.success(`All ${count} records loaded.`);
      break;
    }

    if (count === previousCount) {
      stableRounds++;
      if (stableRounds >= config.crawl.scrollStableRounds * 2) {
        logger.warn(`Count stabilized at ${count} after ${stableRounds} stable rounds. Stopping scroll.`);
        break;
      }
    } else {
      stableRounds = 0;
    }

    previousCount = count;

    // Save current URLs to cache after every batch
    const currentEntries = await listPage.evaluate((baseUrl) => {
      const rows = document.querySelectorAll('.list-view-record');
      const results = [];
      rows.forEach(row => {
        const link = row.querySelector("[role='cell']:nth-child(1) a");
        const statusEl = row.querySelector("[role='cell']:nth-child(2) span span");
        if (link) {
          const href = link.getAttribute('href').split('?')[0];
          results.push({
            fullName: link.textContent.replace(/\s+/g, ' ').trim(),
            licenseStatus: statusEl ? statusEl.textContent.trim() : '',
            currentPageUrl: baseUrl + href,
          });
        }
      });
      return results;
    }, config.source.baseUrl);
    saveUrlCache(currentEntries);

    await listPage.evaluate(() => {
      const container = document.querySelector('.scroll-area.horizontal-table')
        || document.querySelector('[infinite-scroll-distance]')?.parentElement;
      if (container) container.scrollTop = container.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });

    scrollCount++;
    await sleep(config.crawl.scrollIntervalMs);
  }
};

/**
 * Collect all entry URLs from the fully loaded list
 */
const collectListEntries = async () => {
  // Use cache if available (avoids re-scrolling on restart)
  const cached = loadUrlCache();
  if (cached) return cached;

  return await listPage.evaluate((baseUrl) => {
    const rows = document.querySelectorAll('.list-view-record');
    const results = [];
    rows.forEach(row => {
      const link = row.querySelector("[role='cell']:nth-child(1) a");
      const statusEl = row.querySelector("[role='cell']:nth-child(2) span span");
      if (link) {
        const href = link.getAttribute('href').split('?')[0];
        results.push({
          fullName: link.textContent.replace(/\s+/g, ' ').trim(),
          licenseStatus: statusEl ? statusEl.textContent.trim() : '',
          currentPageUrl: baseUrl + href,
        });
      }
    });
    return results;
  }, config.source.baseUrl);
};

/**
 * Load a detail page and return its HTML + parsed data
 */
const loadDetailPage = async (url) => {
  await detailPage.goto(url, {
    waitUntil: 'networkidle2',
    timeout: config.crawl.detailPageTimeout,
  });
  await detailPage.waitForSelector('.dvce-model-property', {
    timeout: config.crawl.detailPageTimeout,
  });
  return detailPage;
};

module.exports = { launch, close, loadListPage, scrollUntilAllLoaded, collectListEntries, loadDetailPage };