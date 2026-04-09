
module.exports = {
  // ─── Source ───────────────────────────────────────────────────────────────
  SOURCE_URL: 'https://www.mvma.org/find-a-vet',
  SOURCE_ID:  'mvma.org',

  // ─── Playwright ───────────────────────────────────────────────────────────
  PLAYWRIGHT_HEADLESS: false,
  PLAYWRIGHT_SLOW_MO:  0,
  PAGE_LOAD_TIMEOUT:   30000,  // ms — initial page load
  NAVIGATION_TIMEOUT:  10000,  // ms — wait for next page to render after click
  RENDER_WAIT:         1500,   // ms — settle time after Angular renders new cards

  // ─── Selectors (verified against live DOM) ────────────────────────────────
  SELECTORS: {
    card:        'div.card',
    name:        '.content-contact-name',
    middleLeft:  '.content-middle__left span',
    middleRight: '.content-middle__right span',
    bottomSpans: '.content-bottom span',
    resultCount: '#searchResultsCount .result-count-text',
    nextButton:  'button.mat-mdc-paginator-navigation-next',
  },

  // ─── Crawl behaviour ──────────────────────────────────────────────────────
  DELAY_BETWEEN_PAGES: 1200,  // ms — polite delay after each page turn
  MAX_EMPTY_PAGES:     3,     // stop after N consecutive empty pages

  // ─── Output ───────────────────────────────────────────────────────────────
  OUTPUT_DIR:    'no-sync/output',
  OUTPUT_PREFIX: 'output_mvma.org_vets',

  // ─── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: 'info',  // 'debug' | 'info' | 'warn' | 'error'
};
