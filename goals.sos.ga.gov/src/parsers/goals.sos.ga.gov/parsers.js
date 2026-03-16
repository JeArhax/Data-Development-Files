// ============================================================
// src/parsers/goals.sos.ga.gov/parsers.js
// Parse search results table rows and profile detail pages
// ============================================================
const logger = require('../../utils/loggers');
const { delay } = require('../../utils/async');
const config = require('../../../config');

// ── Search results table ──────────────────────────────────────

/**
 * Read all rows from the current search results page.
 * Uses page.$$ which pierces shadow DOM — document.querySelectorAll()
 * cannot see inside <c-gasos-do-pagination> shadow root.
 */
async function parseSearchRows(page) {
  const rows = await page.$$('table tbody tr');
  const results = [];

  for (const row of rows) {
    try {
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
          ? `${config.BASE_URL}?selectedlicenseId=${dataId}&searchType=Individual`
          : null,
      });
    } catch(e) {
      logger.warn(`[parsers] Row parse error: ${e.message}`);
    }
  }

  return results;
}

/**
 * Get total page count from the results page.
 * Reads "10480 Results Found" text or counts pagination buttons.
 */
async function parsePageInfo(page) {
  try {
    const resultsEl = await page.$('p.t-size_4');
    if (resultsEl) {
      const text = await resultsEl.evaluate(el => el.textContent.trim());
      const m = text.match(/([\d,]+)\s+Results?\s+Found/i);
      if (m) {
        const total = parseInt(m[1].replace(',', ''));
        return { totalResults: total, totalPages: Math.ceil(total / 25) };
      }
    }
  } catch(e) {}

  // Fallback: count pagination buttons
  try {
    const pageBtns = await page.$$('.pagination lightning-button[data-index]');
    if (pageBtns.length > 0) {
      let max = 0;
      for (const btn of pageBtns) {
        const idx = parseInt(await btn.evaluate(el => el.getAttribute('data-index') || '0'));
        if (!isNaN(idx) && idx > max) max = idx;
      }
      return { totalResults: null, totalPages: max + 1 };
    }
  } catch(e) {}

  return { totalResults: null, totalPages: null };
}

// ── Profile detail page ───────────────────────────────────────

/**
 * Parse all fields from a licensee profile detail page.
 * Maps known fields to standard schema keys,
 * and preserves all other fields in camelCase.
 */
async function parseProfilePage(page) {
  const detail = {
    firstName:       null,
    middleName:      null,
    lastName:        null,
    fullName:        null,
    profileLocation: null,
    licenseNumber:   null,
    profession:      null,
    licenseType:     null,
    licenseSubType:  null,
    obtainedBy:      null,
    licenseStatus:   null,
    issueDate:       null,
    expirationDate:  null,
    lastRenewalDate: null,
    currentPageUrl:  null,
  };

  try {
    // Extract all label/value pairs from the detail page
    const rawFields = await page.evaluate(() => {
      const result = {};
      document.querySelectorAll('.row .col-md-3, .row .col-md-4').forEach(col => {
        const label = col.querySelector('.title-label')?.textContent?.trim();
        const value = col.querySelector('p')?.textContent?.trim();
        if (label && value && value.trim()) result[label] = value.trim();
      });
      return result;
    });

    // Map known fields to standard schema
    detail.firstName       = rawFields['FIRST NAME'] || null;
    detail.middleName      = rawFields['MIDDLE'] || null;
    detail.lastName        = rawFields['LAST NAME'] || null;
    detail.profileLocation = rawFields['ADDRESS'] || rawFields[' ADDRESS'] || null;
    detail.licenseNumber   = rawFields['LICENSE NUMBER'] || null;
    detail.profession      = rawFields['PROFESSION'] || null;
    detail.licenseType     = rawFields['LICENSE TYPE'] || null;
    detail.licenseSubType  = rawFields['SUB TYPE'] || null;
    detail.obtainedBy      = rawFields['OBTAINED BY'] || null;
    detail.licenseStatus   = rawFields['STATUS'] || null;
    detail.issueDate       = rawFields['ISSUED'] || null;
    detail.expirationDate  = rawFields['EXPIRES'] || null;
    detail.lastRenewalDate = rawFields['LAST RENEWAL DATE'] || null;
    detail.currentPageUrl  = page.url();

    // Build fullName from parts
    detail.fullName = [detail.firstName, detail.middleName, detail.lastName]
      .filter(Boolean).join(' ') || null;

    // Preserve all remaining fields in camelCase (don't rename or interpret)
    const knownLabels = new Set([
      'FIRST NAME', 'MIDDLE', 'LAST NAME', 'ADDRESS', ' ADDRESS',
      'LICENSE NUMBER', 'PROFESSION', 'LICENSE TYPE', 'SUB TYPE',
      'OBTAINED BY', 'STATUS', 'ISSUED', 'EXPIRES', 'LAST RENEWAL DATE',
    ]);

    for (const [label, value] of Object.entries(rawFields)) {
      if (knownLabels.has(label)) continue;
      const camelKey = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
      if (camelKey && !detail[camelKey]) {
        detail[camelKey] = value;
      }
    }

  } catch(e) {
    logger.warn(`[parsers] Profile parse error: ${e.message}`);
  }

  return detail;
}

module.exports = { parseSearchRows, parsePageInfo, parseProfilePage };