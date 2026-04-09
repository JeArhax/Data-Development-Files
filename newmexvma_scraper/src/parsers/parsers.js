'use strict';

/**
 * parsers.js — nmvma.site-ym.com (New Mexico VMA)
 *
 * Same YourMembership platform as msvet/movma.
 * Address format uses state abbreviation (NM, CO) not full state name.
 * All members have public profile links.
 *
 * Profile page fields (confirmed from live HTML):
 *   b.big                          → fullName
 *   text after b.big               → membershipType
 *   #tdEmployerName                → companyName, jobTitle, companyAddress
 *   #tdWorkPhone > a[href^="http"] → companyWebsiteUrl
 *   label "Profession" → td        → profession
 *   tr.CstmFldRow "Species"        → speciesList
 *   tr.CstmFldRow "Medical Disc."  → medicalDiscipline
 *   a[href^="mailto:"]             → profileEmail
 *   #tdAddress                     → personalAddress
 *   #tdHomePhone                   → personalPhone
 *   Education/Experience th → td   → educationExperience
 *   Social/Volunteer th → td       → socialVolunteer
 *   More Information th → td       → moreInformation
 *   Additional Info custom fields  → showInDirectory
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

// ── Phase 1: Listing card parser ──────────────────────────────────────────────

function parseListingCard(cardHTML, pageUrl = config.SOURCE_URL) {
  if (!cardHTML) return null;
  try {
    const { document } = parseHTML(`<div>${cardHTML}</div>`);

    const linkEl    = document.querySelector('div.memb-img-wrap a[href]');
    const href      = linkEl ? linkEl.getAttribute('href') : null;
    const idMatch   = href ? href.match(/[?&]id=(\d+)/) : null;
    const profileId = idMatch ? idMatch[1] : null;

    const nameEl   = document.querySelector('p.name a.normalName');
    const fullName = text(nameEl);

    // Address: city, state abbr, zip — varying completeness
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
        // Could be just "United States" (already filtered) or just city
        companyCity = lines[0];
      } else if (lines.length === 2) {
        companyCity  = lines[0];
        // Second line could be state abbr or zip
        if (/^\d{5}/.test(lines[1])) {
          companyZip = lines[1];
        } else {
          companyState = lines[1];
        }
      } else if (lines.length >= 3) {
        companyCity  = lines[0];
        companyState = lines[1];
        companyZip   = lines[2];
      }
    }

    if (!fullName && !profileId) return null;

    return {
      fullName,
      profileId,
      companyCity,
      companyState,
      companyZip,
      profilePageUrl: profileId ? `${config.PROFILE_URL}${profileId}` : null,
      // Filled in Phase 2:
      companyName:          null,
      jobTitle:             null,
      companyAddress:       null,
      companyWebsiteUrl:    null,
      profileEmail:         null,
      personalAddress:      null,
      personalPhone:        null,
      membershipType:       null,
      profession:           null,
      speciesList:          null,
      medicalDiscipline:    null,
      educationExperience:  null,
      socialVolunteer:      null,
      moreInformation:      null,
      sourceUrl:            config.SOURCE_ID,
      currentPageUrl:       pageUrl,
      scrapedAt:            new Date().toISOString(),
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

// ── Phase 2: Profile page parser ──────────────────────────────────────────────

function parseProfilePage(html, member) {
  if (!html) return member;

  try {
    const { document } = parseHTML(html);

    // ── Name ──────────────────────────────────────────────────────────────────
    const nameEl = document.querySelector('b.big');
    if (nameEl) member.fullName = nullIfEmpty(text(nameEl));

    // ── Membership type (text node after b.big) ───────────────────────────────
    if (nameEl) {
      let node = nameEl.nextSibling;
      while (node) {
        const t = nullIfEmpty(node.textContent);
        if (t) { member.membershipType = t; break; }
        node = node.nextSibling;
      }
    }

    // ── Email ─────────────────────────────────────────────────────────────────
    const mailLink = document.querySelector('a[href^="mailto:"]');
    if (mailLink) member.profileEmail = mailLink.getAttribute('href').replace('mailto:', '').trim();

    // ── Company info (#tdEmployerName) ────────────────────────────────────────
    const empEl = document.querySelector('#tdEmployerName');
    if (empEl) {
      const links = [...empEl.querySelectorAll('a')];
      // First link with txt_employName param = company name
      const compLink = links.find(a => (a.getAttribute('href') || '').includes('txt_employName'));
      if (compLink) member.companyName = nullIfEmpty(text(compLink));

      // Text after company name link = job title (before address)
      const raw = empEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

      // Remove company name from lines to find job title and address
      const compName = member.companyName || '';
      const remaining = lines.filter(l => l !== compName);

      // Job title is usually the first non-address remaining line
      const addrKeywords = /united states|new mexico|nm|co|az|tx|\d{5}/i;
      const nonAddrLines = remaining.filter(l => !addrKeywords.test(l));
      const addrLines    = remaining.filter(l => addrKeywords.test(l));

      if (nonAddrLines.length > 0) member.jobTitle = nonAddrLines[0];
      if (addrLines.length > 0)    member.companyAddress = addrLines.join(', ');
    }

    // ── Company website (#tdWorkPhone has the website link for this site) ─────
    const workPhoneEl = document.querySelector('#tdWorkPhone');
    if (workPhoneEl) {
      const webLink = workPhoneEl.querySelector('a[href^="http"]');
      if (webLink) member.companyWebsiteUrl = webLink.getAttribute('href');

      // Also check for phone text
      const raw = workPhoneEl.innerHTML
        .replace(/<a[^>]*>.*?<\/a>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      const phone = nullIfEmpty(raw);
      if (phone && /\d{3}/.test(phone)) member.companyPhone = phone;
    }

    // ── Personal address & phone ──────────────────────────────────────────────
    const persAddrEl = document.querySelector('#tdAddress');
    if (persAddrEl) {
      const raw = persAddrEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\[.*?\]/gs, '')
        .trim();
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length) member.personalAddress = lines.join(', ');
    }

    const homePhoneEl = document.querySelector('#tdHomePhone');
    if (homePhoneEl) {
      const raw = homePhoneEl.innerHTML
        .replace(/<span[^>]*>.*?<\/span>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      member.personalPhone = nullIfEmpty(raw);
    }

    // ── Profession ────────────────────────────────────────────────────────────
    const profEl = document.querySelector('#tdWorkType');
    if (profEl) member.profession = nullIfEmpty(text(profEl));

    // ── Custom fields (Species, Medical Discipline, Show in Directory) ─────────
    document.querySelectorAll('tr.CstmFldRow').forEach(row => {
      const labelEl = row.querySelector('label.CstmFldLbl');
      const valueEl = row.querySelector('td.CstmFldVal, span.CstmFldVal');
      if (!labelEl) return;

      const label = nullIfEmpty(text(labelEl))?.replace(/:$/, '').toLowerCase() || '';
      const value = nullIfEmpty(text(valueEl || row));
      if (!value) return;

      if (label.includes('species'))             member.speciesList       = value;
      else if (label.includes('medical'))        member.medicalDiscipline = value;
    });

    // ── Free-text sections (Education, Social, More Information) ──────────────
    document.querySelectorAll('th, td > div.underline > b').forEach(heading => {
      const headingText = text(heading)?.toLowerCase() || '';
      let contentEl = null;

      // Find the next <td> with actual content after this heading
      const tr = heading.closest('tr');
      if (tr) {
        let nextTr = tr.nextElementSibling;
        while (nextTr) {
          const td = nextTr.querySelector('td');
          if (td && nullIfEmpty(text(td))) { contentEl = td; break; }
          nextTr = nextTr.nextElementSibling;
        }
      }

      if (!contentEl) return;
      const val = nullIfEmpty(text(contentEl));
      if (!val) return;

      if (headingText.includes('education') || headingText.includes('experience')) {
        member.educationExperience = val;
      } else if (headingText.includes('social') || headingText.includes('volunteer')) {
        member.socialVolunteer = val;
      } else if (headingText.includes('more information')) {
        member.moreInformation = val;
      }
    });

    member.scrapedAt = new Date().toISOString();

  } catch (err) {
    logger.error(`[parser] parseProfilePage error: ${err.message}`);
  }

  return member;
}

module.exports = { parseListingCard, parseListingCards, parseProfilePage };
