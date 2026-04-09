'use strict';

/**
 * parsers.js — msvet.org
 *
 * Listing card (confirmed from live HTML):
 *   div.memb-result-item
 *     div.memb-img-wrap > a[href="/members/?id=56099646"]  → profileId
 *     p.name > a.normalName                               → fullName
 *     p.address (br-separated)                            → city, zip
 *
 * Profile page (confirmed from live HTML):
 *   b.big                                → fullName
 *   a[href^="mailto:"]                   → profileEmail
 *   #tdEmployerName                      → companyAddress (work)
 *   #tdWorkPhone                         → companyPhone
 *   #tdAddress                           → personalAddress
 *   #tdHomePhone                         → personalPhone (mobile)
 *   label "Category" → .CstmFldVal       → memberCategory
 *   label "Types of Animals" → .CstmFldVal → animalsSeenList
 *   label "Veterinary School" → .CstmFldVal → vetSchool
 *   label "Graduation Year" → .CstmFldVal  → graduationYear
 *   label "County" → .CstmFldVal          → county
 *   last ViewTable1 > td (after Certifications th) → certifications
 */

const { parseHTML } = require('linkedom');
const logger        = require('../utils/loggers');
const config        = require('../config');

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

    const linkEl    = document.querySelector('div.memb-img-wrap a');
    const href      = linkEl ? linkEl.getAttribute('href') : null;
    const idMatch   = href ? href.match(/[?&]id=(\d+)/) : null;
    const profileId = idMatch ? idMatch[1] : null;

    const nameEl   = document.querySelector('p.name a.normalName');
    const fullName = text(nameEl);

    const addrEl = document.querySelector('p.address');
    let companyCity = null;
    let companyZip  = null;
    if (addrEl) {
      const raw   = addrEl.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      companyCity = lines[0] || null;
      companyZip  = lines[1] || null;
    }

    if (!fullName && !profileId) return null;

    return {
      fullName,
      profileId,
      companyCity,
      companyZip,
      profilePageUrl: profileId ? `${config.PROFILE_URL}${profileId}` : null,
      // Filled in Phase 2:
      companyAddress:    null,
      companyPhone:      null,
      personalAddress:   null,
      personalPhone:     null,
      profileEmail:      null,
      memberCategory:    null,
      animalsSeenList:   null,
      vetSchool:         null,
      graduationYear:    null,
      county:            null,
      certifications:    null,
      membershipType:    null,
      sourceUrl:         config.SOURCE_ID,
      currentPageUrl:    pageUrl,
      scrapedAt:         new Date().toISOString(),
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

    // ── Membership type (line after name) ─────────────────────────────────────
    // "MVMA Membership" text node after b.big
    if (nameEl) {
      let node = nameEl.nextSibling;
      while (node) {
        const t = nullIfEmpty(node.textContent);
        if (t && !t.startsWith('<')) { member.membershipType = t; break; }
        node = node.nextSibling;
      }
    }

    // ── Email ─────────────────────────────────────────────────────────────────
    const mailLink = document.querySelector('a[href^="mailto:"]');
    if (mailLink) member.profileEmail = mailLink.getAttribute('href').replace('mailto:', '').trim();

    // ── Work address (#tdEmployerName) ────────────────────────────────────────
    const workAddrEl = document.querySelector('#tdEmployerName');
    if (workAddrEl) {
      const raw = workAddrEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\s*\[.*?\]\s*/gs, '')  // remove [Map] links
        .trim();
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      member.companyAddress = lines.join(', ') || null;
    }

    // ── Work phone (#tdWorkPhone) ─────────────────────────────────────────────
    const workPhoneEl = document.querySelector('#tdWorkPhone');
    if (workPhoneEl) {
      // Get just the first text node (before the "(Phone)" span)
      const raw = workPhoneEl.innerHTML
        .replace(/<span[^>]*>.*?<\/span>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      member.companyPhone = nullIfEmpty(raw);
    }

    // ── Personal address (#tdAddress) ─────────────────────────────────────────
    const persAddrEl = document.querySelector('#tdAddress');
    if (persAddrEl) {
      const raw = persAddrEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\s*\[.*?\]\s*/gs, '')
        .trim();
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      member.personalAddress = lines.join(', ') || null;
    }

    // ── Personal/mobile phone (#tdHomePhone) ──────────────────────────────────
    const homePhoneEl = document.querySelector('#tdHomePhone');
    if (homePhoneEl) {
      const raw = homePhoneEl.innerHTML
        .replace(/<span[^>]*>.*?<\/span>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      member.personalPhone = nullIfEmpty(raw);
    }

    // ── Custom fields (label → value pairs) ───────────────────────────────────
    // Structure: <label class="CstmFldLbl">X:</label> in td, sibling td.CstmFldVal
    document.querySelectorAll('tr.CstmFldRow').forEach(row => {
      const labelEl = row.querySelector('label.CstmFldLbl');
      const valueEl = row.querySelector('td.CstmFldVal');
      if (!labelEl || !valueEl) return;

      const label = nullIfEmpty(text(labelEl))?.replace(/:$/, '').toLowerCase() || '';
      const value = nullIfEmpty(text(valueEl));
      if (!value) return;

      if (label.includes('category'))          member.memberCategory  = value;
      else if (label.includes('animals seen') || label.includes('types of animal')) member.animalsSeenList = value;
      else if (label.includes('veterinary school')) member.vetSchool   = value;
      else if (label.includes('graduation year'))   member.graduationYear = value;
      else if (label.includes('county'))            member.county      = value;
    });

    // ── Certifications ────────────────────────────────────────────────────────
    // Find th containing "Certifications", then next tr's td
    document.querySelectorAll('th').forEach(th => {
      if (text(th)?.toLowerCase().includes('certif')) {
        const tr = th.closest('tr')?.nextElementSibling;
        if (tr) member.certifications = nullIfEmpty(text(tr));
      }
    });

    member.scrapedAt = new Date().toISOString();

  } catch (err) {
    logger.error(`[parser] parseProfilePage error: ${err.message}`);
  }

  return member;
}

module.exports = { parseListingCard, parseListingCards, parseProfilePage };