/**
 * config.js — Project configuration for onestop.md.gov
 */

module.exports = {
  source: {
    baseUrl: 'https://onestop.md.gov',
    listUrl: 'https://onestop.md.gov/list_views/662fee43557f9400f4cdd80d?35f75b8b-2639-d36f-4342-dbe2c416f509=true',
    sourceUrl: 'onestop.md.gov',
  },

  crawl: {
    totalExpected: 3430,
    scrollIntervalMs: 2500,       // wait between infinite scroll triggers
    scrollStableRounds: 20,       // stop scrolling if count unchanged for N rounds
    pageLoadTimeout: 60000,       // 60s — allows manual captcha solving
    detailPageTimeout: 30000,     // 30s per detail page
    retryAttempts: 3,             // retry failed detail pages
    retryDelayMs: 3000,           // delay between retries
    batchSaveInterval: 50,        // save progress every N records
    headless: false,              // false = visible browser (needed for captcha)
  },

  output: {
    jsonlFile: require('path').join(__dirname, 'no-sync/output/output_onestop.md.gov_veterinarians_2025.jsonl'),
    csvFile:   require('path').join(__dirname, 'no-sync/output/output_onestop.md.gov_veterinarians_2025.csv'),
    failedFile: require('path').join(__dirname, 'no-sync/output/output_onestop.md.gov_veterinarians_failed_2025.jsonl'),
  },
};