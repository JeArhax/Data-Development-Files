'use strict';

module.exports = {
  SOURCE_URL:    'https://www.movma.org/search/newsearch.asp',
  SOURCE_ID:     'movma.org',
  BASE_URL:      'https://www.movma.org',
  PROFILE_URL:   'https://www.movma.org/members/?id=',

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
  OUTPUT_PREFIX: 'output_movma.org_vets',
};