'use strict';

/**
 * parsers.js — nhvma.com
 *
 * Same YourMembership platform as msvet/movma BUT:
 * - Many members have malformed/missing profile links (<a _top"="">) — no profileId
 * - Profile pages require login — Phase 2 is skipped entirely
 * - Name is in either <a class="normalName"> OR <span class="normalName"> (no link)
 * - Address: city, [state,] zip, [country] on separate <br> lines
 *
 * All data is extracted from listing cards only.
 */

const { parseHTML } = require('linkedom');
const logger        = require('../utils/loggers');
const config        = require('../../config');

const text = (el) => {
  if (!el) return null;
  const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
};
const nullIfEmpty = (s) => (s && s.trim() ? s.trim() : null);

function parseListingCard(cardHTML, pageUrl = config.SOURCE_URL) {
  if (!cardHTML) return null;
  try {
    const { document } = parseHTML(`<div>${cardHTML}</div>`);

    // ── Profile ID — only present when member opted in ────────────────────────
    const linkEl  = document.querySelector('div.memb-img-wrap a[href]');
    const href    = linkEl ? linkEl.getAttribute('href') : null;
    const idMatch = href ? href.match(/[?&]id=(\d+)/) : null;
    const profileId = idMatch ? idMatch[1] : null;

    // ── Name — two variants: linked (<a>) or plain (<span>) ──────────────────
    const nameEl = document.querySelector('p.name a.normalName')
                || document.querySelector('p.name span.normalName');
    const fullName = text(nameEl);

    // ── Address — city, [state,] zip, [country] on <br> lines ────────────────
    const addrEl = document.querySelector('p.address');
    let companyCity  = null;
    let companyState = null;
    let companyZip   = null;

    if (addrEl) {
      const raw   = addrEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      const lines = raw.split('\n')
        .map(l => l.trim())
        .filter(l => l && l !== 'United States');

      if (lines.length === 1) {
        // Just city, or just zip
        companyCity = lines[0];
      } else if (lines.length === 2) {
        // city + zip (no state)
        companyCity = lines[0];
        companyZip  = lines[1];
      } else if (lines.length >= 3) {
        // city + state + zip
        companyCity  = lines[0];
        companyState = lines[1];
        companyZip   = lines[2];
      }
    }

    if (!fullName) return null;

    return {
      fullName,
      profileId,
      companyCity,
      companyState,
      companyZip,
      profilePageUrl: profileId ? `${config.PROFILE_URL}${profileId}` : null,
      sourceUrl:      config.SOURCE_ID,
      currentPageUrl: pageUrl,
      scrapedAt:      new Date().toISOString(),
    };
  } catch (err) {
    logger.error(`[parser] parseListingCard error: ${err.message}`);
    return null;
  }
}

function parseListingCards(cardHTMLs, pageUrl) {
  const records = [];
  for (let i = 0; i < cardHTMLs.length; i++) {
    try {
      const r = parseListingCard(cardHTMLs[i], pageUrl);
      if (r) records.push(r);
    } catch (err) {
      logger.error(`[parser] Card ${i} error: ${err.message}`);
      records.push({
        rawParseError:  err.message,
        rawCardHtml:    cardHTMLs[i]?.slice(0, 300),
        sourceUrl:      config.SOURCE_ID,
        currentPageUrl: pageUrl,
        scrapedAt:      new Date().toISOString(),
      });
    }
  }
  return records;
}

// Phase 2 not used — profiles require login
function parseProfilePage(html, member) { return member; }

module.exports = { parseListingCard, parseListingCards, parseProfilePage };
