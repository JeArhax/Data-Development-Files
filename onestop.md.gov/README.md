# onestop.md.gov — MD Veterinarians Scraper

Scrapes the public directory of registered Veterinarians in the State of Maryland from [onestop.md.gov](https://onestop.md.gov/list_views/662fee43557f9400f4cdd80d).

## Tech Stack

| Tool | Reason |
|---|---|
| **Node.js** | Matches team stack, async-first |
| **Puppeteer** | Required — site uses Vue.js with infinite scroll + captcha |
| **No Axios/cheerio** | HTML is JS-rendered, not static |

## Data Extracted

From **list page**: `fullName`, `licenseStatus`, `currentPageUrl`  
From **detail page** (all fields dynamically): `credential`, `licenseNumber`, `licenseStatus`, `licenseDate`, `licenseExpirationDate` + any extra fields found  
Metadata: `sourceUrl`, `currentPageUrl`, `scrapedAt`

## Setup

```bash
npm install
node main_onestop.md.gov.js
```

> ⚠️ A browser window will open. If a captcha appears, solve it manually — the scraper waits up to 60 seconds.

## Resume

Just re-run `node main_onestop.md.gov.js` — already-scraped URLs are detected from the JSONL output and skipped automatically.

## Output

```
no-sync/output/output_onestop.md.gov_veterinarians_2025.jsonl
no-sync/output/output_onestop.md.gov_veterinarians_2025.csv
no-sync/output/output_onestop.md.gov_veterinarians_failed_2025.jsonl  ← only if errors
```

## Project Structure

```
onestop.md.gov/
├── config.js                          # All config (timeouts, URLs, output paths)
├── main_onestop.md.gov.js             # Entry point / orchestrator
├── package.json
├── .gitignore
├── src/
│   ├── parsers/onestop.md.gov/
│   │   └── parsers.js                 # Detail page parser (dynamic/recursive)
│   ├── processors/
│   │   └── urlProcessor_onestop.md.gov.js  # Per-URL fetch + parse + retry
│   ├── services/onestop.md.gov/
│   │   └── client.js                  # Puppeteer browser client
│   └── utils/
│       ├── async.js                   # sleep, retry with backoff
│       ├── transforms.js              # camelCase, flatten, timestamp
│       ├── loggers.js                 # Structured logger
│       └── errors.js                  # Error classes
└── no-sync/                           # Git-ignored
    ├── input/                         # Input files (if any)
    └── output/                        # All output files
```

## Notes & Observations

- The scroll container ID (e.g. `#dc4e55e8-...`) is **dynamically generated** on each page load — class-based selectors must be used instead
- The list order is **non-deterministic** (randomized on each load) — this is fine since all URLs are collected before scraping begins
- The site has **captcha protection** (`vtp_captcha`) — headless mode is disabled so the user can solve it manually
- Detail pages use a consistent `.dvce-model-property` structure — parser is built dynamically to capture all fields without hardcoding
