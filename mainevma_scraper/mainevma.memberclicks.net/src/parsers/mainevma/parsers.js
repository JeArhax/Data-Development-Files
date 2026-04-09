'use strict';

const { nowIso } = require('../../utils/transforms');
const logger = require('../../utils/logger');

const SOURCE_URL    = 'mainevma.memberclicks.net';
const DIRECTORY_URL = 'https://mainevma.memberclicks.net/index.php?option=com_mcdirectorysearch&view=search&id=10533#/';

const text = (str) => str
  ? str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()
  : null;

function parseDomCards(pageContent) {
  const members = [];
  const cardMatches = [...pageContent.matchAll(/<div[^>]*class="card"[^>]*>([\s\S]*?)<\/div>\s*<!---->/g)];

  if (cardMatches.length === 0) {
    logger.warn('[parser] No .card elements found in DOM');
    return members;
  }
  logger.info(`[parser] Found ${cardMatches.length} cards`);

  for (const match of cardMatches) {
    try {
      const member = parseCard(match[1]);
      if (member) members.push(member);
    } catch (err) {
      logger.warn('[parser] Error parsing card', { error: err.message });
    }
  }
  return members;
}

function parseCard(html) {
  // Profile ID from avatar URL
  const avatarMatch = html.match(/src="\/membership\/profile\/(\d+)\/avatar\.jpg"/);
  const profileId   = avatarMatch ? avatarMatch[1] : null;

  // Vet name
  const nameBlock = html.match(/<div[^>]*class="content-contact-name"[^>]*>([\s\S]*?)<\/div>/);
  const fullName  = nameBlock ? text(nameBlock[1]) || null : null;

  // content-top: clinic + address
  const topBlock = html.match(/<div[^>]*class="content-top"[^>]*>([\s\S]*?)<\/div>/);
  const topSpans = topBlock
    ? [...topBlock[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
        .map(m => text(m[1])).filter(s => s && s !== ',    ')
    : [];
  const companyName     = topSpans[0] || null;
  const companyLocation = topSpans.slice(1).filter(Boolean).join(', ') || null;

  // content-middle__left: phone, email, website
  const leftBlock = html.match(/<div[^>]*class="content-middle__left"[^>]*>([\s\S]*?)<\/div>/);
  const leftSpans = leftBlock
    ? [...leftBlock[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(m => text(m[1])).filter(Boolean)
    : [];

  let profilePhone = null, profileEmail = null, profileWebsiteUrl = null;
  for (const span of leftSpans) {
    if (span.startsWith('Phone')) {
      profilePhone = span.replace(/^Phone\s*/i, '').trim() || null;
    } else if (span.includes('@')) {
      profileEmail = span.trim();
    } else if (span.match(/^https?:\/\/|^www\./i) || span.match(/\.[a-z]{2,}(\/|$)/i)) {
      profileWebsiteUrl = span.startsWith('http') ? span : `http://${span}`;
    }
  }

  // content-bottom: labeled fields
  const bottomBlock = html.match(/<div[^>]*class="content-bottom"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
  const bottomSpans = bottomBlock
    ? [...bottomBlock[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(m => text(m[1])).filter(Boolean)
    : [];

  const fields = {};
  for (const span of bottomSpans) {
    const m = span.match(/^([^:]+):\s*(.*)/s);
    if (m) fields[m[1].trim()] = m[2].trim() || null;
  }

  // Skip fully empty cards
  if (!companyName && !fullName && !profileEmail && !profilePhone) return null;

  return {
    fullName,
    profileEmail,
    profilePhone,
    companyName,
    companyLocation,
    profileWebsiteUrl,
    animalsSeenList:        fields['Animals Seen']               || null,
    specialInterestsList:   fields['Special Interests']          || null,
    boardCertifications:    fields['Board Certifications']       || null,
    usdaAphisCertification: fields['USDA-APHIS Certification']   || null,
    vetSchool:              fields['Veterinary School']          || null,
    profileId,
    avatarUrl: profileId
      ? `https://mainevma.memberclicks.net/membership/profile/${profileId}/avatar.jpg`
      : null,
    sourceUrl:      SOURCE_URL,
    currentPageUrl: DIRECTORY_URL,
    scrapedAt:      nowIso(),
  };
}

function parseTotalCount(pageContent) {
  const m = pageContent.match(/(\d+)\s+results/);
  return m ? parseInt(m[1], 10) : null;
}

function parseInterceptedResponses() {
  return { members: [], totalPages: null, rawPayloads: [] };
}

function parsePaginationInfo(pageContent) {
  return { totalMembers: parseTotalCount(pageContent), perPage: 10 };
}

module.exports = { parseDomCards, parseCard, parseTotalCount, parseInterceptedResponses, parseDomFallback: parseDomCards, parsePaginationInfo };