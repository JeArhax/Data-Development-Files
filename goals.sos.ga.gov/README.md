# goals.sos.ga.gov — Veterinary Licensee Scraper

Scrapes all Veterinary license types from the Georgia GOALS professional licensee search portal.

## Site Architecture

- **Platform**: Salesforce Experience Cloud (LWR/Aura)
- **URL**: https://goals.sos.ga.gov/GASOSOneStop/s/licensee-search
- **SPA**: Full client-side JavaScript rendering — static HTML fetch returns empty skeleton
- **Approach**: Playwright stealth browser automation (browser-first due to irregular pagination)

## License Types Scraped

Loop over these types using the **Individual** search type filter:

| Type | Est. Records |
|------|-------------|
| Veterinarian | ~6,000+ |
| Veterinary Technician | ~4,000+ |
| Veterinary Faculty | ~100–500 |
| Veterinary Specialist | ~100–500 |

> **Total: ~10,000+ records**

## Setup

### Requirements
- Node.js >= 18
- ~500MB disk (Playwright Chromium)

### Install

```bash
npm install
npm run install-browsers   # downloads Playwright Chromium
```

### Configuration

Edit `config.js` before running:

```js
HEADLESS: true,           // set false to watch browser
VET_LICENSE_TYPES: [...], // verify against live dropdown
DELAY_BETWEEN_PAGES_MS: [2000, 4000],  // adjust if getting rate-limited
```

### Run

```bash
node main_goals.sos.ga.gov.js
```

Output is written to `no-sync/output/` (not committed to git).

## !! CRITICAL: First-Run Checklist !!

Before running at scale:

1. **Verify selectors**: Run with `HEADLESS: false` and `MAX_PAGES_PER_TYPE: 2`
2. **Inspect dropdown**: Open DevTools → Elements, find the License Type dropdown and copy exact option values
3. **Update `VET_LICENSE_TYPES`** in `config.js` with verified values from step 2
4. **Verify `SELECTORS`** in `config.js` — Salesforce component selectors change with platform updates
5. **Check for captcha**: If hCaptcha/Cloudflare appears, implement solving step (see Notes)
6. **Verify column headers**: Check `extractTableHeaders()` output in debug logs matches actual table

## Project Structure

```
goals.sos.ga.gov/
├── src/
│   ├── parsers/goals.sos.ga.gov/
│   │   └── parsers.js           # parseSearchResultPage(), parseDetailPage()
│   ├── processors/
│   │   └── urlProcessors_goals.sos.ga.gov.js  # crawl loop per license type
│   └── services/goals.sos.ga.gov/
│       └── client.js            # Playwright browser, navigation, pagination
├── utils/
│   ├── async.js                 # delay(), retryWithBackoff()
│   ├── transforms.js            # camelCase, flatten, CSV/JSONL utils
│   ├── loggers.js               # winston logger
│   └── errors.js                # custom error classes
├── no-sync/                     # !! NOT committed to git !!
│   ├── input/
│   │   └── input_goals.sos.ga.gov_2025.js
│   └── output/
│       ├── output_goals.sos.ga.gov_vet-licensees_YYYY-MM-DD.jsonl
│       ├── output_goals.sos.ga.gov_vet-licensees_YYYY-MM-DD.csv
│       ├── scraper.log
│       └── scraper_error.log
├── main_goals.sos.ga.gov.js     # entry point
├── config.js                    # all configuration
├── package.json
└── .gitignore
```

## Output Schema

### JSONL (primary)

```json
{
  "fullName": "Jane Smith",
  "firstName": "Jane",
  "lastName": "Smith",
  "licenseNumber": "VET-12345",
  "licenseType": "Veterinarian",
  "boardName": "State Board of Veterinary Medicine",
  "licenseStatus": "Active",
  "expirationDate": "12/31/2026",
  "issueDate": "01/15/2018",
  "profileLocation": "Atlanta, GA",
  "licenseId": "8X0gTV1W9rEhI2na...",
  "currentPageUrl": "https://goals.sos.ga.gov/...",
  "sourceUrl": "goals.sos.ga.gov",
  "scrapedAt": "2025-03-13T10:30:00Z"
}
```

### CSV (secondary)
Flattened version of JSONL — nested objects expanded, arrays stringified.

## Pagination Notes

The GOALS site uses **non-standard Salesforce LWR pagination** — page numbers are not URL parameters. Pagination state is held in the SPA component. This is why the **browser approach is mandatory**: the "Next" button click drives the internal Salesforce component state. Attempting to replay API calls without browser state requires harvesting rotating session tokens on every request, which is fragile.

## Error Handling

| Error type | Behavior |
|------------|----------|
| Selector not found | Log `WARN`, attempt fallback selectors |
| Row parse failure | Store as `rawParseError: true` in `failed_*.jsonl` |
| Empty page (non-last) | Log `WARN`, continue to next page |
| Session expired | Re-navigate to search page, retry |
| HTTP timeout | Retry with exponential backoff (3 attempts) |
| No results for type | Log `INFO`, skip to next type |

## Notes & Observations

- **Captcha**: If hCaptcha appears, increase delays (`DELAY_BETWEEN_PAGES_MS`) and/or implement a solving service (2captcha, capsolver). As of initial analysis, captcha was not observed on guest search.
- **Session**: Salesforce sessions are cookie-based. Single browser context handles all license types without re-auth.
- **Email/Phone**: Not expected to be visible in public search results — the site exposes name, license number, type, status, expiration only. Contact data may require detail page navigation.
- **Detail pages**: `parseDetailPage()` is implemented but not called by default. Enable for richer data (disciplinary actions, address, etc.).
- **Pagination order**: Non-sequential. The "Next Page" button is the only reliable navigation method — do not attempt offset-based replay.
