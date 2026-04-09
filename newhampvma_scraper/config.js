'use strict';

module.exports = {
  SOURCE_URL:    'https://www.nhvma.com/search/newsearch.asp',
  SOURCE_ID:     'nhvma.com',
  BASE_URL:      'https://www.nhvma.com',
  PROFILE_URL:   'https://www.nhvma.com/members/?id=',

  PLAYWRIGHT_HEADLESS: false,
  PLAYWRIGHT_SLOW_MO:  0,
  PAGE_LOAD_TIMEOUT:   30000,
  RENDER_WAIT:         2000,

  SELECTORS: {
    resultItem:  'li div.memb-result-item',
    name:        'p.name a.normalName, p.name span.normalName',
    address:     'p.address',
    profileLink: 'div.memb-img-wrap a',
    docCount:    '#DocCount',
    pageCounter: '#page-counter span',
  },

  PAGE_DELAY:       1500,
  PROFILE_DELAY:    800,
  MAX_EMPTY_PAGES:  3,

  OUTPUT_DIR:    'no-sync/output',
  OUTPUT_PREFIX: 'output_nhvma.com_vets',
};
