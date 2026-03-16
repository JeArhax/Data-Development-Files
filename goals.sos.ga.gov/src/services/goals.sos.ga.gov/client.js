// ============================================================
// src/services/goals.sos.ga.gov/client.js
// Browser automation — launch, warmup, search, navigation
// ============================================================
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const config = require('../../../config');
const logger = require('../../utils/loggers');
const { delay, randomDelay } = require('../../utils/async');
const CaptchaSolver = require('../../../captchaSolver');

const RECAPTCHA_SITE_KEY = '';
const captchaSolver = new CaptchaSolver();

let browser = null;
let page = null;

// ── Error detection & dismissal ───────────────────────────────

async function isAuraErrorVisible() {
  try {
    return await page.evaluate(() => {
      const mask = document.getElementById('auraErrorMask');
      return mask && (
        mask.classList.contains('auraForcedErrorBox') ||
        window.getComputedStyle(mask).display !== 'none'
      );
    });
  } catch(e) { return false; }
}

async function dismissAuraError() {
  try {
    if (await isAuraErrorVisible()) {
      await page.evaluate(() => {
        const btn = document.getElementById('dismissError');
        if (btn) btn.click();
      });
      await delay(800);
      logger.info('[client] Dismissed Aura error dialog');
    }
  } catch(e) {}
}

/**
 * When reCAPTCHA fires mid-session ("Invalid key type" error):
 * 1. Dismiss the Aura error dialog
 * 2. Solve a real token via 2captcha
 * 3. Inject the token into the page and fire grecaptchaVerified
 * 4. Re-click Search so the server accepts the token
 * This avoids a full page.goto() which would trigger captcha again.
 */
async function solveCaptchaAndResubmit(profession, licenseType) {
  logger.info('[client] Captcha error detected — solving via 2captcha...');
  await dismissAuraError();
  await delay(1000);

  try {
    // Solve a real v2 token
    const token = await captchaSolver.solveRecaptchaV2(
      RECAPTCHA_SITE_KEY,
      config.BASE_URL,
      false
    );
    logger.info(`[client] Token solved (${token.slice(0, 20)}...)`);

    // Inject token into all recaptcha textareas on the page
    await page.evaluate((t) => {
      document.querySelectorAll('textarea[name="g-recaptcha-response"]')
        .forEach(ta => { ta.value = t; });
      // Fire both verified events the LWC listens to
      document.dispatchEvent(new CustomEvent('grecaptchaVerified', {
        detail: { response: t, action: 'Submit' }
      }));
      document.dispatchEvent(new CustomEvent('grecaptchaV2Verified', {
        detail: { response: t }
      }));
    }, token);

    await delay(500);

    // Re-click Search button to resubmit with the valid token
    await page.click('button.slds-button_brand').catch(() => {});

    // Wait for results
    await Promise.race([
      page.waitForSelector('table tbody tr', { timeout: 30000 }),
      page.waitForFunction(() => {
        const mask = document.getElementById('auraErrorMask');
        return mask && mask.classList.contains('auraForcedErrorBox');
      }, { timeout: 30000 }),
    ]).catch(() => {});

    if (await isAuraErrorVisible()) {
      logger.warn('[client] Still getting captcha error after solve — falling back to full re-search');
      await dismissAuraError();
      await delay(2000);
      // Last resort: full navigation
      await doSearch(profession, licenseType);
      return false; // signal that we had to re-search (lost page position)
    }

    await delay(2000);
    logger.info('[client] Captcha solved and search resubmitted successfully');
    return true; // signal that we recovered in place (page position preserved)

  } catch(e) {
    logger.error(`[client] 2captcha solve failed: ${e.message}`);
    await dismissAuraError();
    await doSearch(profession, licenseType);
    return false;
  }
}

// ── Browser launch & warmup ───────────────────────────────────

async function launchBrowser() {
  if (browser) return;
  logger.info('[client] Launching browser...');

  browser = await puppeteer.launch({
    headless: false, // Must be false when using real user profile
    slowMo: config.SLOW_MO,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    userDataDir: 'C:\\Users\\lenovo\\AppData\\Local\\Microsoft\\Edge\\User Data',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
      '--profile-directory=Default',
    ],
  });

  page = await browser.newPage();
  await page.setUserAgent(config.USER_AGENT);
  await page.setViewport(config.VIEWPORT);

  // Navigate to search page and wait for form to be ready
  logger.info('[client] Navigating to search page...');
  await page.goto(config.BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(2000);

  try {
    await page.waitForSelector('button[name="GASOS_Profession_Type__c"]', { timeout: 15000 });
    logger.info('[client] Page ready');
  } catch(e) {
    logger.warn('[client] Warning: form not ready after page load');
  }
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    logger.info('[client] Browser closed');
  }
}

// ── Dropdown selection ────────────────────────────────────────

async function selectDropdown(buttonSelector, itemValue) {
  await page.waitForSelector(buttonSelector, { timeout: 15000 });
  await page.click(buttonSelector);
  await page.waitForSelector(`lightning-base-combobox-item[data-value="${itemValue}"]`, { timeout: 8000 }).catch(() => {});
  await randomDelay([400, 700]);
  const item = await page.$(`lightning-base-combobox-item[data-value="${itemValue}"]`);
  if (item) {
    await item.click();
    logger.debug(`[client] Selected: ${itemValue}`);
  } else {
    logger.warn(`[client] Dropdown item not found: ${itemValue}`);
    await page.keyboard.press('Escape');
  }
  await randomDelay([400, 700]);
}

// ── Search ────────────────────────────────────────────────────

async function _submitSearch(profession, licenseType) {
  await page.click('label[for="radio-0-3"]').catch(() => {});
  await randomDelay([600, 1000]);
  await selectDropdown('button[name="GASOS_Profession_Type__c"]', profession);
  await randomDelay([1000, 1800]);
  await selectDropdown('button[name="GASOS_License_Type__c"]:not([disabled])', licenseType);
  await randomDelay([700, 1200]);
  await page.click('button.slds-button_brand').catch(() => {});
}

async function doSearch(profession, licenseType, maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.debug(`[client] doSearch attempt ${attempt}/${maxAttempts} for "${licenseType}"`);

    await page.goto(config.BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(2000);
    await dismissAuraError();

    await _submitSearch(profession, licenseType);

    // Wait for results OR captcha error
    await Promise.race([
      page.waitForSelector('table tbody tr', { timeout: 30000 }),
      page.waitForFunction(() => {
        const mask = document.getElementById('auraErrorMask');
        return mask && mask.classList.contains('auraForcedErrorBox');
      }, { timeout: 30000 }),
    ]).catch(() => {});

    if (await isAuraErrorVisible()) {
      logger.warn(`[client] Captcha error on attempt ${attempt} — dismissing and waiting before retry...`);
      await dismissAuraError();
      // Increasing wait between retries — gives reCAPTCHA session time to reset
      const waitMs = attempt * 3000;
      logger.info(`[client] Waiting ${waitMs}ms before retry ${attempt + 1}...`);
      await delay(waitMs);
      continue; // try again
    }

    // Success — results table is visible
    await delay(2000);
    logger.debug(`[client] Search successful on attempt ${attempt}`);
    return true;
  }

  logger.error(`[client] doSearch failed after ${maxAttempts} attempts — captcha not resolved`);
  throw new Error(`doSearch failed after ${maxAttempts} attempts for "${licenseType}"`);
}

// ── Pagination ────────────────────────────────────────────────

async function clickNextPage() {
  // All pagination elements are inside shadow DOM — use page.$$ not page.$
  // page.$$ with Puppeteer pierces shadow DOM; page.$() does NOT reliably

  // Find all lightning-button elements and look for the one with class "next"
  const allLightningBtns = await page.$$('lightning-button');
  let nextBtn = null;

  for (const lb of allLightningBtns) {
    const hasNextClass = await lb.evaluate(el => el.classList.contains('next')).catch(() => false);
    if (hasNextClass) {
      // Get the inner <button>
      const inner = await lb.$('button').catch(() => null);
      if (inner) { nextBtn = inner; break; }
    }
  }

  // Fallback: find by aria-label
  if (!nextBtn) {
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
      const label = await btn.evaluate(el => el.getAttribute('aria-label') || '').catch(() => '');
      if (label.toLowerCase().includes('next page') || label.toLowerCase() === 'navigate to next page') {
        nextBtn = btn;
        break;
      }
    }
  }

  if (!nextBtn) {
    logger.debug('[client] No Next button found — assuming last page');
    return false;
  }

  const disabled = await nextBtn.evaluate(el =>
    el.disabled || el.getAttribute('aria-disabled') === 'true'
  ).catch(() => true);

  if (disabled) {
    logger.debug('[client] Next button disabled — last page reached');
    return false;
  }

  await nextBtn.click();
  await delay(2000);

  // Wait for rows — use page.$$ (shadow DOM safe)
  let waited = 0;
  while (waited < 20000) {
    const rows = await page.$$('table tbody tr');
    if (rows.length > 0) break;
    if (await isAuraErrorVisible()) break;
    await delay(500);
    waited += 500;
  }
  // Human-like delay between pages — critical to avoid reCAPTCHA scoring us as bot
  await randomDelay([4000, 8000]);
  return true;
}

// ── Skip to page (used during recovery) ──────────────────────

async function skipToPage(targetPage) {
  if (targetPage <= 1) return;
  logger.info(`[client] Skipping to page ${targetPage}...`);
  for (let i = 1; i < targetPage; i++) {
    const ok = await clickNextPage();
    if (!ok) break;
    if (i % 20 === 0) logger.debug(`[client] Skipped to page ${i + 1}`);
  }
  await delay(1000);
}

module.exports = {
  launchBrowser,
  closeBrowser,
  doSearch,
  clickNextPage,
  skipToPage,
  dismissAuraError,
  isAuraErrorVisible,
  solveCaptchaAndResubmit,
  getPage: () => page,
};