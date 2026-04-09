'use strict';

/**
 * parsers.js — members.nysvms.org (NYSVMS Hospital Directory)
 *
 * Listing card (confirmed from live HTML):
 *   div[data-member-id="3967534"]
 *     a.c-directory-map-view-member-badge__info-name  → companyName + profilePath
 *     span.address                                    → companyAddress
 *     a[href^="tel:"]                                 → companyPhone
 *     a.icon.website                                  → companyWebsiteUrl
 *     a.icon.modal-iframe[href*="member-contact"]     → profileId (toid param)
 *
 * Profile page (confirmed from live HTML):
 *   h1.o-details-block__title                         → companyName
 *   span.address                                      → companyAddress (full, comma-separated)
 *   span.phone                                        → companyPhone
 *   a.icon.website                                    → companyWebsiteUrl
 *   span after "Active Member" img                    → membershipType
 *   div.c-directory__custom-fields sections:
 *     span.areas-header.practice-type                 → practiceType
 *     span.areas-header.services                      → services
 *     span.areas-header.species-treated               → speciesTreated
 *     (any other custom field sections preserved)
 */

const { nowIso } = require('../utils/transforms');
const logger     = require('../utils/loggers');
const config     = require('../../config');

const text = (str) => str
  ? str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  : null;
const nullIfEmpty = (s) => (s && s.trim() ? s.trim() : null);

// ── Directory listing parser ───────────────────────────────────────────────

function parseDomCards(pageContent) {
  const members = [];

  // Each card is wrapped in div[data-member-id="..."]
  const cardRe = /<div[^>]*data-member-id="(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*data-member-id="|$)/g;
  const matches = [...pageContent.matchAll(cardRe)];

  if (matches.length === 0) {
    logger.warn('[parser] No cards found');
    return members;
  }

  logger.info(`[parser] Found ${matches.length} cards`);

  for (const m of matches) {
    try {
      const card = parseCard(m[1], m[2]);
      if (card) members.push(card);
    } catch (err) {
      logger.warn('[parser] Card parse error', { error: err.message });
    }
  }

  return members;
}

function parseCard(memberId, html) {
  // Company name + profile path
  const nameM = html.match(/class="c-directory-map-view-member-badge__info-name"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  const companyName = nameM ? nullIfEmpty(text(nameM[2])) : null;
  const profilePath = nameM ? nameM[1] : null;

  // Address
  const addrM = html.match(/<span[^>]*class="address"[^>]*>([\s\S]*?)<\/span>/);
  const companyAddress = addrM ? nullIfEmpty(text(addrM[1])) : null;

  // Phone
  const telM = html.match(/href="tel:([^"]+)"/);
  const companyPhone = telM ? telM[1].trim() : null;

  // Website
  const webM = html.match(/class="icon website"[^>]*href="([^"]+)"/);
  const companyWebsiteUrl = webM ? webM[1] : null;

  // Profile ID from toid param
  const toidM = html.match(/member-contact\?toid=([a-f0-9\-]+)/);
  const profileId = toidM ? toidM[1] : null;

  if (!companyName) return null;

  return {
    memberId,
    companyName,
    companyAddress,
    companyPhone,
    companyWebsiteUrl,
    profileId,
    profilePath,
    profilePageUrl: profilePath ? `${config.PROFILE_BASE}${profilePath}` : null,
    // Filled in Phase 2:
    membershipType: null,
    practiceType:   null,
    services:       null,
    speciesTreated: null,
    sourceUrl:      config.SOURCE_ID,
    currentPageUrl: config.SOURCE_URL,
    scrapedAt:      new Date().toISOString(),
  };
}

// ── Profile page parser ────────────────────────────────────────────────────

function parseProfilePage(html, member) {
  if (!html) return member;

  // Company name (may be more complete)
  const nameM = html.match(/<h1[^>]*class="[^"]*o-details-block__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
  if (nameM) member.companyName = nullIfEmpty(text(nameM[1]));

  // Address (full, comma-separated on profile)
  const addrM = html.match(/<span[^>]*class="address"[^>]*>([\s\S]*?)<\/span>/);
  if (addrM) member.companyAddress = nullIfEmpty(text(addrM[1]));

  // Phone
  const phoneM = html.match(/<span[^>]*class="phone"[^>]*>([\s\S]*?)<\/span>/);
  if (phoneM) member.companyPhone = nullIfEmpty(text(phoneM[1]));

  // Website
  const webM = html.match(/class="[^"]*icon[^"]*website[^"]*"[^>]*href="([^"]+)"/);
  if (webM) member.companyWebsiteUrl = webM[1];

  // Membership type — span after the member logo img
  const memTypeM = html.match(/<span>(\w[\w\s]+Member[\w\s]*)<\/span>/);
  if (memTypeM) member.membershipType = nullIfEmpty(memTypeM[1]);

  // Custom field sections — span.areas-header + div.work > span.title
  const sectionRe = /<div[^>]*class="[^"]*c-directory__custom-fields[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*c-directory__custom-fields|$)/g;
  for (const sec of html.matchAll(sectionRe)) {
    const secHtml = sec[1];

    // Label from span.areas-header
    const labelM = secHtml.match(/<span[^>]*class="[^"]*areas-header[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    if (!labelM) continue;
    const label = nullIfEmpty(text(labelM[1]));
    if (!label) continue;

    // Values from span.title inside div.work
    const values = [...secHtml.matchAll(/<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/g)]
      .map(v => nullIfEmpty(text(v[1])))
      .filter(Boolean)
      .join(', ');

    const lc = label.toLowerCase();
    if (lc.includes('practice type'))      member.practiceType   = values || null;
    else if (lc.includes('service'))       member.services       = values || null;
    else if (lc.includes('species'))       member.speciesTreated = values || null;
    // Preserve any other custom fields dynamically
    else if (values) {
      const key = lc.replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
      member[key] = values;
    }
  }

  
  member.scrapedAt = new Date().toISOString();
  return member;
}

function parsePaginationInfo(pageContent) {
  const m = pageContent.match(/(\d[\d,]*)\s+(?:found|results?|members?|hospitals?)/i);
  const total = m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  return { totalMembers: total };
}

module.exports = { parseDomCards, parseCard, parseProfilePage, parsePaginationInfo };