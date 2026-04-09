'use strict';

module.exports = {
  SOURCE_URL:    'https://members.nysvms.org/hospitals?MapView=true',
  SOURCE_ID:     'members.nysvms.org',
  BASE_URL:      'https://members.nysvms.org',
  PROFILE_BASE:  'https://members.nysvms.org',

  PLAYWRIGHT_HEADLESS: false,
  PAGE_LOAD_TIMEOUT:   60000,
  RENDER_WAIT:         3000,

  CRAWL_PAGE_DELAY:    1500,
  PROFILE_DELAY:       800,
  MAX_RETRIES:         3,
  RETRY_BASE_DELAY:    2000,

  OUTPUT_DIR:    './no-sync/output',
  OUTPUT_PREFIX: 'output_nysvms_hospitals',
};
