
const { parseHTML } = require('linkedom');
const config        = require('../../config');
const logger        = require('../../utils/loggers');
const { ParseError } = require('../../utils/errors');

const SOURCE_ID = config.SOURCE_ID;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get trimmed innerText of an element, or null if missing/empty */
function text(el) {
  if (!el) return null;
  const t = (el.textContent ?? '').trim();
  return t || null;
}

/**
 * Split a comma-separated string into a deduplicated array of trimmed values.
 * Returns null if the input is empty/null.
 */
function splitDedup(str) {
  if (!str) return null;
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  // Deduplicate while preserving order
  return [...new Set(parts)];
}

/**
 * Parse city/state/zip string like "Edina MN 55435" into parts.
 * Format observed: "{City} {StateAbbr} {Zip}"
 */
function parseCityStateZip(raw) {
  if (!raw) return { companyCity: null, companyState: null, companyZip: null };
  // Match: everything before last two tokens = city, then state abbr, then zip
  const match = raw.match(/^(.*?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (match) {
    return {
      companyCity:  match[1].trim() || null,
      companyState: match[2],
      companyZip:   match[3],
    };
  }
  // Fallback: store raw
  return { companyCity: raw, companyState: null, companyZip: null };
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse one card's innerHTML into a structured record.
 *
 * @param {string} cardHTML  - innerHTML of a single .card element
 * @param {string} pageUrl   - current page URL (for currentPageUrl field)
 * @returns {object|null}
 */
function parseCard(cardHTML, pageUrl = config.SOURCE_URL) {
  if (!cardHTML || typeof cardHTML !== 'string') return null;

  try {
    const { document } = parseHTML(`<div>${cardHTML}</div>`);

    // ── Name ──────────────────────────────────────────────────────────────────
    const fullName = text(document.querySelector('.content-contact-name'));

    // ── Middle-left: clinic, address, city/state/zip ──────────────────────────
    const leftSpans = [...document.querySelectorAll('.content-middle__left span')];

    // First span contains a <strong> tag with the clinic name
    const companyName = text(leftSpans[0]?.querySelector('strong')) 
                     ?? text(leftSpans[0]);

    // Address is the second span (may not exist)
    const companyAddress = text(leftSpans[1]) || null;

    // City/state/zip is the third span (may not exist)
    const cityStateZipRaw = text(leftSpans[2]) || null;
    const { companyCity, companyState, companyZip } = parseCityStateZip(cityStateZipRaw);

    // Build composite location string
    const locationParts = [companyAddress, cityStateZipRaw].filter(Boolean);
    const companyLocation = locationParts.length ? locationParts.join(', ') : null;

    // ── Middle-right: business type, phone, website ───────────────────────────
    const rightSpans = [...document.querySelectorAll('.content-middle__right span')];

    const companyType  = text(rightSpans[0]) || null;
    const companyPhone = text(rightSpans[1]) || null;
    const companyWebsiteUrl = text(rightSpans[2]) || null;

    // ── Bottom: [hr divider], species, skills, practiceOffers ─────────────────
    const bottomSpans = [...document.querySelectorAll('.content-bottom span')];

    // Index 0 is always the <hr> divider — skip it
    const speciesRaw       = text(bottomSpans[1]) || null;
    const skillsRaw        = text(bottomSpans[2]) || null;
    const practiceOffersRaw = text(bottomSpans[3]) || null;

    // Deduplicate species (observed duplicates in live data e.g. "Canine, Feline, Canine, Feline")
    const profileSpecies = splitDedup(speciesRaw);

    // Skills: preserve as array but do NOT deduplicate —
    // combo entries like "Internal Medicine, Pain Management" are intentional
    const profileSkills = skillsRaw
      ? skillsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    const profilePracticeOffers = splitDedup(practiceOffersRaw);

    // ── Assemble record ───────────────────────────────────────────────────────
    const record = {
      fullName,
      companyName,
      companyType,
      companyPhone,
      companyWebsiteUrl,
      companyAddress,
      companyCity,
      companyState,
      companyZip,
      companyLocation,
      profileSpecies,
      profileSkills,
      profilePracticeOffers,
      sourceUrl:      SOURCE_ID,
      currentPageUrl: pageUrl,
      scrapedAt:      new Date().toISOString(),
    };

    // Remove keys where value is null to keep output clean
    // (null = field present but empty; we keep them to distinguish from absent fields)
    // Actually per guidelines §4.3 we DO keep nulls — they signal "checked, empty"
    return record;

  } catch (err) {
    throw new ParseError(`parseCard failed: ${err.message}`, { cardHTML: cardHTML.slice(0, 200) });
  }
}

/**
 * Parse all cards from a page's worth of card HTML strings.
 * Errors on individual cards are caught and logged; valid records are returned.
 *
 * @param {string[]} cardHTMLs  - array of card innerHTML strings
 * @param {string}   pageUrl
 * @returns {object[]}
 */
function parseCards(cardHTMLs, pageUrl) {
  const records = [];
  for (let i = 0; i < cardHTMLs.length; i++) {
    try {
      const record = parseCard(cardHTMLs[i], pageUrl);
      if (record) records.push(record);
    } catch (err) {
      logger.error(`[parsers] Card ${i} parse error: ${err.message}`);
      // Save raw fallback so no record is silently lost
      records.push({
        rawParseError:  err.message,
        rawCardHtml:    cardHTMLs[i]?.slice(0, 500),
        sourceUrl:      SOURCE_ID,
        currentPageUrl: pageUrl,
        scrapedAt:      new Date().toISOString(),
      });
    }
  }
  return records;
}

module.exports = { parseCard, parseCards };
