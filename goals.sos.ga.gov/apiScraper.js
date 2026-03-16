const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

const PAGE_URL = 'https://goals.sos.ga.gov/GASOSOneStop/s/licensee-search';
const SOURCE_URL = 'goals.sos.ga.gov';
const delay = ms => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => delay(min + Math.random() * (max - min));

let browser = null;
let page = null;

// ── Helpers ──────────────────────────────────────────────────

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
    const visible = await isAuraErrorVisible();
    if (visible) {
      await page.evaluate(() => {
        const btn = document.getElementById('dismissError');
        if (btn) btn.click();
      });
      await delay(800);
      console.log('[apiScraper] Dismissed Aura error dialog');
    }
  } catch(e) {}
}

async function launchBrowser() {
  if (browser) return;
  browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,900'],
  });
  page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0');

  // Warmup — eat the first captcha failure
  console.log('[apiScraper] Loading page for warmup...');
  await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(2000);

  console.log('[apiScraper] Running warmup search (captcha error expected)...');
  try {
    await page.waitForSelector('button[name="GASOS_Profession_Type__c"]', { timeout: 10000 });
    await page.click('button[name="GASOS_Profession_Type__c"]');
    await page.waitForSelector('lightning-base-combobox-item[data-value="Veterinary Medicine"]', { timeout: 5000 }).catch(() => {});
    await delay(400);
    await page.$eval('lightning-base-combobox-item[data-value="Veterinary Medicine"]', el => el.click()).catch(() => {});
    await delay(800);
    await page.waitForSelector('button[name="GASOS_License_Type__c"]:not([disabled])', { timeout: 5000 }).catch(() => {});
    await page.click('button[name="GASOS_License_Type__c"]').catch(() => {});
    await page.waitForSelector('lightning-base-combobox-item[data-value="Veterinarian"]', { timeout: 5000 }).catch(() => {});
    await delay(400);
    await page.$eval('lightning-base-combobox-item[data-value="Veterinarian"]', el => el.click()).catch(() => {});
    await delay(600);
    await page.click('button.slds-button_brand').catch(() => {});
    await delay(5000);
  } catch(e) {
    console.log('[apiScraper] Warmup step error (expected):', e.message);
  }

  await dismissAuraError();

  console.log('[apiScraper] Reloading page after warmup...');
  await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(3000);

  try {
    await page.waitForSelector('button[name="GASOS_Profession_Type__c"]', { timeout: 15000 });
    console.log('[apiScraper] Warmup complete — page ready');
  } catch(e) {
    console.warn('[apiScraper] Warning: form not ready after warmup reload');
  }
}

async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; page = null; }
}

async function selectDropdown(buttonSelector, itemValue) {
  await page.waitForSelector(buttonSelector, { timeout: 15000 });
  await page.click(buttonSelector);
  await page.waitForSelector(`lightning-base-combobox-item[data-value="${itemValue}"]`, { timeout: 8000 }).catch(() => {});
  await randomDelay(400, 700);
  const item = await page.$(`lightning-base-combobox-item[data-value="${itemValue}"]`);
  if (item) { await item.click(); console.log(`  Selected: ${itemValue}`); }
  else { console.warn(`  Not found: ${itemValue}`); await page.keyboard.press('Escape'); }
  await randomDelay(400, 700);
}

async function doSearch(profession, licenseType) {
  await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(1500);
  await dismissAuraError();

  await page.click('label[for="radio-0-3"]').catch(() => {});
  await randomDelay(600, 1000);
  await selectDropdown('button[name="GASOS_Profession_Type__c"]', profession);
  await randomDelay(1000, 1800);
  await selectDropdown('button[name="GASOS_License_Type__c"]:not([disabled])', licenseType);
  await randomDelay(700, 1200);
  await page.click('button.slds-button_brand').catch(() => {});

  // Wait for results OR error dialog — whichever comes first
  await Promise.race([
    page.waitForSelector('table tbody tr', { timeout: 30000 }),
    page.waitForFunction(() => {
      const mask = document.getElementById('auraErrorMask');
      return mask && mask.classList.contains('auraForcedErrorBox');
    }, { timeout: 30000 }),
  ]).catch(() => {});

  // If error appeared, dismiss and retry once
  if (await isAuraErrorVisible()) {
    console.warn('[apiScraper] Captcha error on search — dismissing and retrying...');
    await dismissAuraError();
    await delay(2000);
    await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(1500);
    await page.click('label[for="radio-0-3"]').catch(() => {});
    await randomDelay(600, 1000);
    await selectDropdown('button[name="GASOS_Profession_Type__c"]', profession);
    await randomDelay(1000, 1800);
    await selectDropdown('button[name="GASOS_License_Type__c"]:not([disabled])', licenseType);
    await randomDelay(700, 1200);
    await page.click('button.slds-button_brand').catch(() => {});
    await page.waitForSelector('table tbody tr', { timeout: 30000 });
  }

  await delay(3000);
}

// ── Read table rows using page.$$ (shadow DOM piercing) ──────

async function readTableRows() {
  const rows = await page.$$('table tbody tr');
  const results = [];
  for (const row of rows) {
    const cells = await row.$$('td');
    if (cells.length < 2) continue;
    const dataId = await row.$eval('a[data-id]', a => a.getAttribute('data-id')).catch(() => null);
    results.push({
      fullName:       await cells[0].evaluate(td => td.getAttribute('title') || td.textContent.trim()).catch(() => ''),
      licenseNumber:  await cells[1].evaluate(td => td.getAttribute('title') || td.textContent.trim()).catch(() => ''),
      profession:     await cells[2].evaluate(td => td.getAttribute('title') || td.textContent.trim()).catch(() => ''),
      licenseType:    await cells[3].evaluate(td => td.getAttribute('title') || td.textContent.trim()).catch(() => ''),
      licenseSubType: await cells[4].evaluate(td => td.getAttribute('title') || td.textContent.trim()).catch(() => ''),
      status:         await cells[5].evaluate(td => td.getAttribute('title') || td.textContent.trim()).catch(() => ''),
      city:           await cells[6].evaluate(td => td.getAttribute('title') || td.textContent.trim()).catch(() => ''),
      dataId,
      profileUrl: dataId
        ? `https://goals.sos.ga.gov/GASOSOneStop/s/licensee-search?selectedlicenseId=${dataId}&searchType=Individual`
        : null,
    });
  }
  return results;
}

async function getCurrentPageInfo() {
  try {
    const resultsEl = await page.$('p.t-size_4');
    if (resultsEl) {
      const text = await resultsEl.evaluate(el => el.textContent.trim());
      const m = text.match(/([\d,]+)\s+Results?\s+Found/i);
      if (m) {
        const total = parseInt(m[1].replace(',', ''));
        return { current: null, total: Math.ceil(total / 25) };
      }
    }
  } catch(e) {}
  try {
    const pageBtns = await page.$$('.pagination lightning-button[data-index]');
    if (pageBtns.length > 0) {
      let max = 0;
      for (const btn of pageBtns) {
        const idx = parseInt(await btn.evaluate(el => el.getAttribute('data-index') || '0'));
        if (!isNaN(idx) && idx > max) max = idx;
      }
      return { current: null, total: max + 1 };
    }
  } catch(e) {}
  return { current: null, total: null };
}

async function clickNextPage() {
  const selectors = [
    'lightning-button.next button',
    'button[title="next"]',
    'button[aria-label="Navigate to Next Page"]',
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel).catch(() => null);
    if (!btn) continue;
    const disabled = await btn.evaluate(el =>
      el.disabled || el.getAttribute('aria-disabled') === 'true'
    ).catch(() => true);
    if (disabled) { console.log('  Next button disabled — last page reached'); return false; }
    await btn.click();
    await delay(1500);
    // Wait for rows to appear using page.$$ (shadow DOM safe)
    let waited = 0;
    while (waited < 20000) {
      const rows = await page.$$('table tbody tr');
      if (rows.length > 0) break;
      // Check if error appeared while waiting
      if (await isAuraErrorVisible()) break;
      await delay(500);
      waited += 500;
    }
    await randomDelay(800, 1500);
    return true;
  }
  console.log('  No Next button found — assuming last page');
  return false;
}

// ── PHASE 1: Collect all rows ─────────────────────────────────

async function phase1CollectAllIds(profession, licenseType, outputDir) {
  const cacheFile = path.join(outputDir, `phase1_ids_${licenseType.replace(/\s+/g,'_')}.json`);

  // Load existing partial data to resume from
  let allRows = [];
  let startPage = 1;

  if (fs.existsSync(cacheFile)) {
    allRows = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    // If we have a round number of rows, calculate which page to resume from
    if (allRows.length > 0 && allRows.length % 25 === 0) {
      startPage = (allRows.length / 25) + 1;
      console.log(`  [Phase 1] Resuming from page ${startPage} (${allRows.length} records already collected)`);
    } else if (allRows.length > 0) {
      // Odd number — last page was partial or complete, just check
      startPage = Math.floor(allRows.length / 25) + 1;
      console.log(`  [Phase 1] Resuming from page ${startPage} (${allRows.length} records already collected)`);
    }
  }

  // If we already have all 420 pages worth, done
  if (allRows.length >= 10480) {
    console.log(`  [Phase 1] Already complete: ${allRows.length} records`);
    return allRows;
  }

  console.log(`\n  [Phase 1] Collecting ALL rows for: ${licenseType} (starting page ${startPage})`);
  await doSearch(profession, licenseType);

  const pageInfo = await getCurrentPageInfo();
  const totalPages = pageInfo.total || 420;
  console.log(`  Total pages: ${totalPages}`);

  // Skip to startPage if resuming
  if (startPage > 1) {
    console.log(`  Skipping to page ${startPage}...`);
    for (let i = 1; i < startPage; i++) {
      const ok = await clickNextPage();
      if (!ok) break;
      if (i % 20 === 0) console.log(`  Skipped to page ${i+1}...`);
    }
    await delay(1000);
  }

  let pageNum = startPage;

  while (pageNum <= totalPages) {
    // Check for error BEFORE reading
    if (await isAuraErrorVisible()) {
      console.warn(`  [Page ${pageNum}] Captcha error detected — recovering...`);
      await dismissAuraError();
      // Save checkpoint
      fs.writeFileSync(cacheFile, JSON.stringify(allRows, null, 2));
      console.log(`  [Checkpoint] Saved ${allRows.length} records`);
      // Re-search and skip back to current page
      await doSearch(profession, licenseType);
      for (let i = 1; i < pageNum; i++) {
        const ok = await clickNextPage();
        if (!ok) break;
      }
      await delay(1500);
    }

    const rows = await readTableRows();

    if (rows.length === 0) {
      console.warn(`  [Page ${pageNum}] 0 rows — waiting and retrying...`);
      await delay(3000);
      await dismissAuraError();

      const retryRows = await readTableRows();
      if (retryRows.length > 0) {
        allRows.push(...retryRows);
        console.log(`  Page ${pageNum}/${totalPages}: ${retryRows.length} rows (retry) (total: ${allRows.length})`);
      } else {
        // Full recovery
        console.warn(`  [Page ${pageNum}] Still 0 rows — full recovery...`);
        fs.writeFileSync(cacheFile, JSON.stringify(allRows, null, 2));
        await doSearch(profession, licenseType);
        for (let i = 1; i < pageNum; i++) {
          await clickNextPage();
        }
        await delay(1500);
        const recoveredRows = await readTableRows();
        if (recoveredRows.length > 0) {
          allRows.push(...recoveredRows);
          console.log(`  Page ${pageNum}/${totalPages}: ${recoveredRows.length} rows (recovered) (total: ${allRows.length})`);
        } else {
          console.warn(`  Page ${pageNum}: skipping — could not recover`);
        }
      }
    } else {
      allRows.push(...rows);
      console.log(`  Page ${pageNum}/${totalPages}: ${rows.length} rows (total: ${allRows.length})`);
    }

    // Save checkpoint every 25 pages
    if (pageNum % 25 === 0) {
      fs.writeFileSync(cacheFile, JSON.stringify(allRows, null, 2));
      console.log(`  [Checkpoint] Saved ${allRows.length} records at page ${pageNum}`);
    }

    if (pageNum >= totalPages) break;
    const hasNext = await clickNextPage();
    if (!hasNext) break;
    pageNum++;
  }

  fs.writeFileSync(cacheFile, JSON.stringify(allRows, null, 2));
  console.log(`\n  [Phase 1] Complete. ${allRows.length} total records saved.`);
  return allRows;
}

// ── PHASE 2: Fetch profile details ───────────────────────────

async function phase2FetchDetails(allRows, profession, licenseType, outputDir, onRecord) {
  const progressFile = path.join(outputDir, `phase2_progress_${licenseType.replace(/\s+/g,'_')}.json`);

  let doneIds = new Set();
  if (fs.existsSync(progressFile)) {
    doneIds = new Set(JSON.parse(fs.readFileSync(progressFile, 'utf8')));
    console.log(`  [Phase 2] Resuming — ${doneIds.size} already done`);
  }

  const remaining = allRows.filter(r => r.dataId && !doneIds.has(r.dataId));
  console.log(`\n  [Phase 2] Fetching details for ${remaining.length} of ${allRows.length} records...`);

  await doSearch(profession, licenseType);

  let done = 0;
  const batch = [];

  for (const row of remaining) {
    process.stdout.write(`  [${done + doneIds.size + 1}/${allRows.length}] ${row.fullName}...\r`);

    let detail = null;
    let retries = 0;

    while (retries < 3) {
      try {
        if (row.profileUrl) {
          await page.goto(row.profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await delay(1500);
        } else {
          const link = await page.$(`a[data-id="${row.dataId}"]`);
          if (!link) throw new Error('Link not found');
          await link.click();
          await delay(1500);
        }
        await page.waitForSelector('.title-label', { timeout: 15000 });
        await delay(1000);
        detail = await extractDetailPage();
        await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(async () => {
          await doSearch(profession, licenseType);
        });
        await delay(1000);
        break;
      } catch(e) {
        retries++;
        console.warn(`\n  Retry ${retries}/3 for ${row.fullName}: ${e.message}`);
        await dismissAuraError();
        await doSearch(profession, licenseType);
        await delay(2000);
      }
    }

    batch.push({ ...row, ...(detail || {}), sourceUrl: SOURCE_URL, scrapedAt: new Date().toISOString() });
    doneIds.add(row.dataId);
    done++;

    if (batch.length >= 25) {
      await onRecord(batch.splice(0));
      fs.writeFileSync(progressFile, JSON.stringify([...doneIds]));
    }

    await randomDelay(800, 1500);
  }

  if (batch.length > 0) {
    await onRecord(batch);
    fs.writeFileSync(progressFile, JSON.stringify([...doneIds]));
  }

  console.log(`\n  [Phase 2] Done: ${done} new records fetched`);
}

async function extractDetailPage() {
  const detail = {};
  try {
    const fields = await page.evaluate(() => {
      const result = {};
      document.querySelectorAll('.row .col-md-3, .row .col-md-4').forEach(col => {
        const label = col.querySelector('.title-label')?.textContent?.trim();
        const value = col.querySelector('p')?.textContent?.trim();
        if (label && value) result[label] = value;
      });
      return result;
    });
    detail.firstName = fields['FIRST NAME'] || null;
    detail.middleName = fields['MIDDLE'] || null;
    detail.lastName = fields['LAST NAME'] || null;
    detail.fullName = [fields['FIRST NAME'], fields['MIDDLE'], fields['LAST NAME']].filter(Boolean).join(' ') || null;
    detail.profileLocation = fields[' ADDRESS'] || fields['ADDRESS'] || null;
    detail.licenseNumber = fields['LICENSE NUMBER'] || null;
    detail.profession = fields['PROFESSION'] || null;
    detail.licenseType = fields['LICENSE TYPE'] || null;
    detail.licenseSubType = fields['SUB TYPE'] || null;
    detail.obtainedBy = fields['OBTAINED BY'] || null;
    detail.licenseStatus = fields['STATUS'] || null;
    detail.issueDate = fields['ISSUED'] || null;
    detail.expirationDate = fields['EXPIRES'] || null;
    detail.lastRenewalDate = fields['LAST RENEWAL DATE'] || null;
    detail.currentPageUrl = page.url();
  } catch(e) { console.warn(`  Detail extract error: ${e.message}`); }
  return detail;
}

// ── Main ──────────────────────────────────────────────────────

async function scrapeAllPages(profession, licenseType, onRecord) {
  await launchBrowser();
  const outputDir = './no-sync/output';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const allRows = await phase1CollectAllIds(profession, licenseType, outputDir);
  await phase2FetchDetails(allRows, profession, licenseType, outputDir, onRecord);

  console.log(`\nScraping complete for: ${licenseType}`);
  return allRows.length;
}

module.exports = { scrapeAllPages, closeBrowser };