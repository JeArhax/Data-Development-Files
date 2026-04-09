'use strict';

/**
 * parsers.js — massvet.org (Novi AMS)
 *
 * Card HTML (confirmed from live HTML):
 *   div[role="listitem"] > div.member.c-member-badge
 *     h4.c-member-badge__name
 *     p.c-member-badge__parent           → companyName (org only)
 *     p.c-member-badge__title-parent     → "Title, Org" combined
 *     p.c-member-badge__title            → jobTitle only
 *     p.c-member-badge__phone            → profilePhone
 *     a[aria-label*="website"]           → profileWebsiteUrl
 *     a[href^="tel:"]                    → profilePhone (canonical)
 *     a.c-member-badge__view-profile     → profilePageUrl
 *     a[href*="member-contact?toid="]    → profileId
 *     p.c-member-badge__leadership-role  → membershipType
 *
 * Profile page HTML (confirmed from live HTML):
 *   h1.c-directory-profile__name                    → fullName
 *   p.c-directory-profile__parent-name              → companyName
 *   p.c-directory-profile__member-type              → membershipType
 *   p.c-directory-profile__member-since (x2)        → memberSince, originalJoinDate
 *   a[aria-label*="website"]                        → profileWebsiteUrl
 *   a[href^="tel:"]                                 → profilePhone
 *   a[href*="member-contact?toid="]                 → profileId
 *   p.c-directory-profile__address                  → companyAddress
 *   p.c-directory-profile__phone                    → companyPhone
 *   a.c-directory-profile__site                     → companyWebsiteUrl
 *   div.c-directory__custom-fields                  → custom field sections
 *     h4.c-directory-profile__custom-fields-title   → field label (class suffix = slug)
 *     div.c-directory-profile__custom-field-copy    → field value(s)
 */

const { nowIso } = require('../utils/transforms');
const logger     = require('../utils/logger');

const SOURCE_URL    = 'massvet.org';
const DIRECTORY_URL = 'https://www.massvet.org/find-a-veterinarian-directory';
const BASE_URL      = 'https://www.massvet.org';

const text = (str) => str
  ? str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  : null;

const nullIfEmpty = (s) => (s && s.trim() ? s.trim() : null);

// ── Directory card parser ──────────────────────────────────────────────────

function parseDomCards(pageContent) {
  const members = [];

  // Split on the col wrapper that contains each card
  const colRe = /<div[^>]*class="col-sm-6[^"]*"[^>]*role="listitem"[^>]*>([\s\S]*?)(?=<div[^>]*class="col-sm-6[^"]*"[^>]*role="listitem"|<!-- ko if|$)/g;
  const matches = [...pageContent.matchAll(colRe)];

  if (matches.length === 0) {
    logger.warn('[parser] No cards found — check selector or page state');
    return members;
  }

  logger.info(`[parser] Found ${matches.length} cards`);

  for (const m of matches) {
    try {
      const card = parseCard(m[0]);
      if (card) members.push(card);
    } catch (err) {
      logger.warn('[parser] Card parse error', { error: err.message });
    }
  }

  return members;
}

function parseCard(html) {
  // Name
  const nameM = html.match(/<h4[^>]*class="[^"]*c-member-badge__name[^"]*"[^>]*>([\s\S]*?)<\/h4>/);
  const fullName = nameM ? nullIfEmpty(text(nameM[1])) : null;

  // Profile page URL
  const slugM = html.match(/href="(\/find-a-veterinarian-directory\/[^"]+)"/);
  const profilePageUrl = slugM ? `${BASE_URL}${slugM[1]}` : null;

  // Profile ID from email contact toid param
  const toidM = html.match(/member-contact\?toid=([a-f0-9\-]+)/);
  const profileId = toidM ? toidM[1] : null;

  // Membership type
  const roleM = html.match(/<p[^>]*class="[^"]*c-member-badge__leadership-role[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const membershipType = roleM ? nullIfEmpty(text(roleM[1])) : null;

  // Phone — prefer tel: href
  const telM       = html.match(/href="tel:([^"]+)"/);
  const phoneTextM = html.match(/<p[^>]*class="[^"]*c-member-badge__phone[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const profilePhone = telM
    ? nullIfEmpty(telM[1])
    : phoneTextM ? nullIfEmpty(text(phoneTextM[1])) : null;

  // Website — link with aria-label containing "website"
  const webM = html.match(/href="(https?:\/\/[^"]+)"[^>]*aria-label="[^"]*website[^"]*"/i);
  const profileWebsiteUrl = webM ? webM[1] : null;

  // Company + job title — three card variants:
  //   p.c-member-badge__parent        = org only
  //   p.c-member-badge__title-parent  = "Title, Org"
  //   p.c-member-badge__title         = title only
  let companyName = null;
  let jobTitle    = null;

  const parentM      = html.match(/<p[^>]*class="[^"]*c-member-badge__parent[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const titleParentM = html.match(/<p[^>]*class="[^"]*c-member-badge__title-parent[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const titleOnlyM   = html.match(/<p[^>]*class="[^"]*c-member-badge__title(?!-)[^"]*"[^>]*>([\s\S]*?)<\/p>/);

  if (parentM) {
    companyName = nullIfEmpty(text(parentM[1]));
  }
  if (titleParentM) {
    const combined = nullIfEmpty(text(titleParentM[1]));
    if (combined && combined.includes(',')) {
      const idx   = combined.indexOf(',');
      jobTitle    = combined.substring(0, idx).trim() || null;
      companyName = combined.substring(idx + 1).trim() || null;
    } else {
      companyName = combined;
    }
  }
  if (titleOnlyM) {
    jobTitle = nullIfEmpty(text(titleOnlyM[1]));
  }

  if (!fullName && !companyName) return null;

  return {
    fullName,
    jobTitle,
    profilePhone,
    profileWebsiteUrl,
    companyName,
    membershipType,
    profileId,
    profilePageUrl,
    // Filled after profile visit:
    companyAddress:    null,
    companyPhone:      null,
    companyWebsiteUrl: null,
    memberSince:       null,
    originalJoinDate:  null,
    locationsServed:   null,
    animalsSeenList:   null,
    servicesOffered:   null,
    surgery:           null,
    houseCallsOffered: null,
    languagesSpoken:   null,
    discountProgram:   null,
    usdaAccredited:    null,
    sourceUrl:         SOURCE_URL,
    currentPageUrl:    DIRECTORY_URL,
    scrapedAt:         nowIso(),
  };
}

// ── Profile page parser ────────────────────────────────────────────────────

function parseProfilePage(html, member) {
  if (!html) return member;

  // ── Address ──────────────────────────────────────────────────────────────
  const addrM = html.match(/<p[^>]*class="[^"]*c-directory-profile__address[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  if (addrM) member.companyAddress = nullIfEmpty(text(addrM[1]));

  // ── Company phone (org-level, may differ from personal phone) ────────────
  const compPhoneM = html.match(/<p[^>]*class="[^"]*c-directory-profile__phone[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  if (compPhoneM) member.companyPhone = nullIfEmpty(text(compPhoneM[1]));

  // ── Company website ───────────────────────────────────────────────────────
  const compWebM = html.match(/<a[^>]*class="[^"]*c-directory-profile__site[^"]*"[^>]*href="([^"]+)"/);
  if (compWebM) member.companyWebsiteUrl = compWebM[1];

  // ── Member Since / Original Join Date ─────────────────────────────────────
  // Two <p class="c-directory-profile__member-since"> elements
  const sinceMatches = [...html.matchAll(/<p[^>]*class="[^"]*c-directory-profile__member-since[^"]*"[^>]*>([\s\S]*?)<\/p>/g)];
  for (const sm of sinceMatches) {
    const val = nullIfEmpty(text(sm[1]));
    if (!val) continue;
    if (/original join/i.test(val)) {
      member.originalJoinDate = val.replace(/original join date:\s*/i, '').trim();
    } else if (/member since/i.test(val)) {
      member.memberSince = val.replace(/member since:\s*/i, '').trim();
    }
  }

  // ── Custom field sections ─────────────────────────────────────────────────
  // Each section: <div class="c-directory__custom-fields">
  //   <h4 class="... locations-served/geographic-area">Locations Served/Geographic Area</h4>
  //   <div class="c-directory-profile__custom-field-copy"><span class="title">Malden</span></div>
  //   <div class="c-directory-profile__custom-field-copy">...</div>
  const sectionRe = /<div[^>]*class="[^"]*c-directory__custom-fields[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*c-directory__custom-fields|$)/g;
  for (const sec of html.matchAll(sectionRe)) {
    const secHtml = sec[1];

    // Label from h4 text
    const labelM = secHtml.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    if (!labelM) continue;
    const label = nullIfEmpty(text(labelM[1]));
    if (!label) continue;

    // All value spans inside copy divs
    const values = [...secHtml.matchAll(/<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/g)]
      .map(v => nullIfEmpty(text(v[1])))
      .filter(Boolean);

    const combined = values.join(', ') || null;

    // Map label to field
    const lc = label.toLowerCase();
    if (lc.includes('location') || lc.includes('geographic'))  member.locationsServed   = combined;
    else if (lc.includes('animal'))                             member.animalsSeenList   = combined;
    else if (lc.includes('service'))                            member.servicesOffered   = combined;
    else if (lc.includes('surgery'))                            member.surgery           = combined;
    else if (lc.includes('house call'))                         member.houseCallsOffered = combined;
    else if (lc.includes('language'))                           member.languagesSpoken   = combined;
    else if (lc.includes('discount'))                           member.discountProgram   = combined;
    else if (lc.includes('usda'))                               member.usdaAccredited    = combined;
  }

  member.scrapedAt = nowIso();
  return member;
}

function parsePaginationInfo(pageContent) {
  const m = pageContent.match(/(\d[\d,]*)\s+(?:found|results?|members?)/i);
  const totalMembers = m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  return { totalMembers };
}

module.exports = { parseDomCards, parseCard, parseProfilePage, parsePaginationInfo };