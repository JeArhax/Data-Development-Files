'use strict';

module.exports = {
  SOURCE_URL:    'https://nmvma.site-ym.com/search/newsearch.asp',
  SOURCE_ID:     'nmvma.site-ym.com',
  BASE_URL:      'https://nmvma.site-ym.com',
  PROFILE_URL:   'https://nmvma.site-ym.com/members/?id=',

  PLAYWRIGHT_HEADLESS: false,
  PLAYWRIGHT_SLOW_MO:  0,
  PAGE_LOAD_TIMEOUT:   30000,
  RENDER_WAIT:         2000,

  SELECTORS: {
    resultItem:  'li div.memb-result-item',
    name:        'p.name a.normalName',
    address:     'p.address',
    profileLink: 'div.memb-img-wrap a',
    docCount:    '#DocCount',
    pageCounter: '#page-counter span',
  },

  PAGE_DELAY:       1500,
  PROFILE_DELAY:    800,
  MAX_EMPTY_PAGES:  3,

  OUTPUT_DIR:    'no-sync/output',
  OUTPUT_PREFIX: 'output_nmvma_vets',
};
