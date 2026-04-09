'use strict';

const config = {
  source: {
    name: 'mainevma.memberclicks.net',
    directoryUrl:
      'https://mainevma.memberclicks.net/index.php?option=com_mcdirectorysearch&view=search&id=10533#/',
    baseUrl: 'https://mainevma.memberclicks.net',
  },

 browser: {
  channel: 'msedge',      // use installed Microsoft Edge
  headless: false,
  networkIdleTimeout: 8000,
  pageLoadTimeout: 30000,
},

  crawl: {
    pageDelay: 1500,
    maxRetries: 3,
    retryBaseDelay: 2000,
  },

  output: {
    dir: './output',
    jsonlFile: 'output_mainevma_profiles.jsonl',
    csvFile: 'output_mainevma_profiles.csv',
    sampleSize: 20,
  },
};

module.exports = config;
