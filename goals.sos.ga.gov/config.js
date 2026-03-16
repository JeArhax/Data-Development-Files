
module.exports = {
  // ── Target ────────────────────────────────────────────────
  SOURCE_URL: 'goals.sos.ga.gov',
  BASE_URL: 'https://goals.sos.ga.gov/GASOSOneStop/s/licensee-search',

  // ── Veterinary license types to loop over ─────────────────
  
  PROFESSION_TYPE: 'Veterinary Medicine', // !! verify exact string from dropdown !!
  VET_LICENSE_TYPES: [
    'Veterinarian',
    'Veterinary Technician',
    'Veterinary Faculty',

    // Add any additional types found in the dropdown
  ],
BROWSER_PROFILE_DIR: 'C:\\Users\\lenovo\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default',

  SEARCH_TYPE: 'Individual',

  // ── Browser ───────────────────────────────────────────────
  HEADLESS: false,           
  SLOW_MO: 0,               
  VIEWPORT: { width: 1280, height: 900 },
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',

  // ── Timing & rate limiting ────────────────────────────────
  DELAY_BETWEEN_PAGES_MS: [2000, 4000],   
  DELAY_BETWEEN_TYPES_MS: [5000, 10000], 
  PAGE_LOAD_TIMEOUT_MS: 30000,
  SELECTOR_TIMEOUT_MS: 15000,

  // ── Retry ─────────────────────────────────────────────────
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 3000,  

  // ── Pagination ────────────────────────────────────────────

  RESULTS_PER_PAGE: 25,

  MAX_PAGES_PER_TYPE: 0,

  // ── Output ────────────────────────────────────────────────
  OUTPUT_DIR: './no-sync/output',
  OUTPUT_PREFIX: 'output_goals.sos.ga.gov_vet-licensees',
 

  // ── Concurrency ───────────────────────────────────────────

  CONCURRENCY: 1,

  // ── Selectors ─────────────────────────────────────────────

  SELECTORS: {
    // Top-level search type radio/toggle (Individual vs Business/Facility)
    searchTypeIndividual: '[data-value="Individual"], input[value="Individual"], .search-type-individual',

    // License type dropdown (lightning-combobox or native select)
    licenseTypeDropdown: 'lightning-combobox[data-id="licenseType"], select[name="licenseType"], [data-field="licenseType"]',

    // Search button
    searchButton: 'button[type="submit"], .search-btn, lightning-button button',

    // Results table rows
    resultRows: 'table tbody tr, .slds-table tbody tr, c-licensee-results-table tbody tr',

    // "Next page" button for pagination
    nextPageButton: 'button[title="Next Page"], .next-page-btn, [aria-label="Next Page"]',

    // No results indicator
    noResults: '.no-results, [data-key="noResults"], .slds-text-color_error',

    // Results count indicator (e.g. "Showing 1-25 of 342")
    resultsCount: '.results-count, [data-key="resultsCount"]',

    // Loading spinner — wait for it to disappear
    loadingSpinner: '.slds-spinner, .loading-spinner, lightning-spinner',
  },

  // ── Logging ───────────────────────────────────────────────
  LOG_LEVEL: 'info', 
};
