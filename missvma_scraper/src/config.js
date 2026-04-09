'use strict';

module.exports = {
  // ── Source ─────────────────────────────────────────────────────────────────
  SOURCE_URL:    'https://msvet.org/search/newsearch.asp',
  SOURCE_ID:     'msvet.org',
  BASE_URL:      'https://msvet.org',
  PROFILE_URL:   'https://msvet.org/members/?id=',

  // ── Playwright ─────────────────────────────────────────────────────────────
  PLAYWRIGHT_HEADLESS: false,
  PLAYWRIGHT_SLOW_MO:  0,
  PAGE_LOAD_TIMEOUT:   30000,
  RENDER_WAIT:         2000,

  // ── Selectors (confirmed from live HTML) ───────────────────────────────────
  SELECTORS: {
    resultItem:  'li div.memb-result-item',
    name:        'p.name a.normalName',
    address:     'p.address',
    profileLink: 'div.memb-img-wrap a',
    docCount:    '#DocCount',
    pageCounter: '#page-counter span',
    nextBtn:     'div.btn-group button:last-child',  // arrow-right = last button
  },

  // ── Crawl ──────────────────────────────────────────────────────────────────
  PAGE_DELAY:          1500,   // ms between directory pages
  PROFILE_DELAY:       800,    // ms between profile page visits
  MAX_EMPTY_PAGES:     3,

  // ── Output ─────────────────────────────────────────────────────────────────
  OUTPUT_DIR:    'no-sync/output',
  OUTPUT_PREFIX: 'output_msvet.org_vets',
};
