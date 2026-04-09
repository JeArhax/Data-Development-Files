'use strict';

const config = {
  source: {
    name:         'massvet.org',
    directoryUrl: 'https://www.massvet.org/find-a-veterinarian-directory',
    baseUrl:      'https://www.massvet.org',
  },

  browser: {
    headless:           false,
    networkIdleTimeout: 5000,
    pageLoadTimeout:    60000,
  },

 crawl: {
    pageDelay:      1500,  // delay between directory pages
    profileDelay:   800,   // delay between profile page visits
    maxRetries:     3,
    retryBaseDelay: 2000,
  },

  output: {
    dir:       './no-sync/output',
    jsonlFile: 'output_massvet_profiles.jsonl',
    csvFile:   'output_massvet_profiles.csv',
    sampleSize: 5,
  },
};

module.exports = config;
