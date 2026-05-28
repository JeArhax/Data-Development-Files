/**
 * parsers/onestop.md.gov/parsers.js
 * Parsing functions for list page and detail/profile pages
 */

const { toIsoTimestamp } = require('../../utils/transforms');
const config = require('../../../config');

/**
 * Parse a single detail page — extracts all visible dvce-model-property fields
 * dynamically (recursive/flexible — doesn't assume fixed schema)
 */
const parseDetailPage = async (page) => {
  return await page.evaluate((sourceUrl) => {
    const currentPageUrl = window.location.href;

    // --- Primary: extract all labeled property blocks dynamically ---
    const allFields = {};
    const propertyBlocks = document.querySelectorAll('.dvce-model-property');

    propertyBlocks.forEach(block => {
      const labelEl = block.querySelector('h4');
      const valueEl = block.querySelector('p span');
      if (!labelEl || !valueEl) return;

      const rawLabel = labelEl.textContent.trim();
      const value = valueEl.textContent.trim();

      // Convert label to camelCase key
      const key = rawLabel
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^\w/, c => c.toLowerCase());

      allFields[key] = value;
    });

    // --- Name from h1 ---
    const nameEl = document.querySelector('h1 var');
    const fullName = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';

    // --- Subtitle (role/type) ---
    const subtitleEl = document.querySelector('.dvce-page-subtitle p strong, .dvce-page-subtitle p');
    const profileTitle = subtitleEl ? subtitleEl.textContent.trim() : '';

    // --- Tabs (e.g. License Information, Disciplinary Action) ---
    const tabs = [];
    document.querySelectorAll('.tabs-container .tab button').forEach(btn => {
      tabs.push(btn.textContent.trim());
    });

    // --- Map standard fields ---
    const standardFields = {
      fullName,
      profileTitle,
      // map known fields to standard schema
      credential:             allFields.credential             || '',
      licenseNumber:          allFields.licenseNumber          || '',
      licenseStatus:          allFields.licenseStatus          || '',
      licenseDate:            allFields.licenseDate            || '',
      licenseExpirationDate:  allFields.licenseExpirationDate  || '',
    };

    // --- Keep all remaining raw fields (preserving original camelCase names) ---
    const knownKeys = new Set(['credential', 'licenseNumber', 'licenseStatus', 'licenseDate', 'licenseExpirationDate']);
    const extraFields = {};
    for (const [k, v] of Object.entries(allFields)) {
      if (!knownKeys.has(k)) extraFields[k] = v;
    }

    // --- Metadata ---
    const meta = {
      sourceUrl,
      currentPageUrl,
      availableTabs: tabs,
      scrapedAt: new Date().toISOString(),
    };

    return {
      ...standardFields,
      ...extraFields,
      ...meta,
    };
  }, config.source.sourceUrl);
};

module.exports = { parseDetailPage };
