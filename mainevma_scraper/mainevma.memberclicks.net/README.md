# Maine VMA — Find a Vet Directory Scraper

Scrapes the **Maine Veterinary Medical Association (MVMA)** public member directory at:
`https://mainevma.memberclicks.net/index.php?option=com_mcdirectorysearch&view=search&id=10533#/`

---

## Architecture & Strategy

### Why Playwright (not plain HTTP)?

The directory is an **Angular SPA** — the initial HTML page contains only a loading spinner. Member data is fetched after boot via internal XHR calls to MemberClicks' backend. A plain `axios.get()` only gets the empty shell.

**Primary approach — JSON interception:**
Playwright launches a real Chromium browser, lets Angular boot, then intercepts all JSON responses from `*.memberclicks.net`. This yields clean structured data directly from the API — no DOM parsing needed.

**Fallback — DOM parsing:**
If no JSON payload is intercepted (e.g. API endpoint changes), the scraper falls back to parsing rendered `<div class="mc-directory-result">` cards from the page HTML.

### API Endpoint (observed via Network tab)
```
GET /index.php?option=com_mcdirectorysearch&format=json&view=searchresults&id=10533&start=0&limit=25
Response: { totalCount: N, profiles: [...] }
```

### Pagination
MemberClicks renders Bootstrap `.pagination` controls. The scraper clicks the `Next` button and waits for `networkidle` after each click, capturing the new JSON batch.

---

## Data Fields Extracted

| Standard Field            | Source Field(s)                              |
|---------------------------|----------------------------------------------|
| `fullName`                | `name`, `displayName`                        |
| `firstName`               | `firstName`, `first_name`                    |
| `lastName`                | `lastName`, `last_name`                      |
| `profileEmail`            | `email`, `emailAddress`                      |
| `profilePhone`            | `phone`, `workPhone`, `officePhone`          |
| `companyName`             | `organization`, `clinic`, `practiceName`     |
| `companyLocation`         | `address`, `city`+`state`                    |
| `profileWebsiteUrl`       | `website`, `websiteUrl`                      |
| `profileTitle`            | `title`, `memberType`                        |
| `animalsSeenList`         | `animalsSeen`, `speciesSeen`                 |
| `specialInterestsList`    | `specialInterests`, `interests`              |
| `boardCertifications`     | `boardCertifications`, `certifications`      |
| `usdaAphisCertification`  | `usdaAphis`, `usda`                          |
| `vetSchool`               | `vetSchool`, `veterinarySchool`              |
| `sourceUrl`               | *(static)* `mainevma.memberclicks.net`       |
| `currentPageUrl`          | *(static)* directory URL                     |
| `sourceApiUrl`            | Intercepted endpoint URL                     |
| `scrapedAt`               | ISO 8601 timestamp                           |

All additional source fields are preserved in **camelCase** (e.g. `memberSince`, `memberId`).

---

## Setup

### Prerequisites
- Node.js 18+
- Chromium (installed via Playwright)

### Install

```bash
npm install
npx playwright install chromium
```

> **Note:** If running on a server without a display, Chromium headless mode is enabled by default in `config.js`.

---

## Usage

```bash
# Standard run
node main_mainevma.js

# Verbose / debug logging
LOG_LEVEL=debug node main_mainevma.js

# npm shortcut
npm start
npm run start:debug
```

---

## Output

Files are written to `./no-sync/output/`:

| File                              | Format | Description                       |
|-----------------------------------|--------|-----------------------------------|
| `output_mainevma_profiles.jsonl`  | JSONL  | One JSON object per line          |
| `output_mainevma_profiles.csv`    | CSV    | Flattened, spreadsheet-ready      |

### JSONL sample
```json
{"fullName":"Dr. Sarah Mitchell DVM","profileEmail":"smitchell@coastalanimal.com","profilePhone":"(207) 555-0101","companyName":"Coastal Animal Hospital","companyLocation":"123 Main St, Portland, ME 04101","profileWebsiteUrl":"https://www.coastalanimal.com","animalsSeenList":["Dogs","Cats"],"specialInterestsList":["Surgery"],"boardCertifications":"DACVIM","usdaAphisCertification":true,"vetSchool":"Cornell University","sourceUrl":"mainevma.memberclicks.net","scrapedAt":"2025-01-07T10:30:00.000Z"}
```

### CSV columns (expected)
`fullName`, `firstName`, `lastName`, `profileEmail`, `profilePhone`, `companyName`, `companyLocation`, `profileWebsiteUrl`, `profileTitle`, `animalsSeenList`, `specialInterestsList`, `boardCertifications`, `usdaAphisCertification`, `vetSchool`, `sourceUrl`, `currentPageUrl`, `sourceApiUrl`, `scrapedAt`, *(+ any extra source fields)*

---

## Project Structure

```
mainevma.memberclicks.net/
├── main_mainevma.js                    # Entry point — orchestrates pipeline
├── config.js                           # All settings (browser path, delays, output)
├── package.json
├── .gitignore
├── README.md
│
├── src/
│   ├── services/mainevma/
│   │   └── client.js                   # Playwright browser automation + response interception
│   │
│   ├── parsers/mainevma/
│   │   └── parsers.js                  # JSON + DOM member parsers
│   │
│   ├── processors/
│   │   └── urlProcessor_mainevma.js    # Crawl orchestration + pagination loop
│   │
│   └── utils/
│       ├── logger.js                   # Coloured console logger
│       ├── errors.js                   # Custom error classes
│       ├── async.js                    # timeWaitFor, withRetry (exponential backoff)
│       ├── transforms.js               # camelCase, nowIso, safeJsonParse
│       └── outputWriter.js             # JSONL + CSV writers
│
└── no-sync/                            # ⚠ gitignored — local only
    └── output/
        ├── output_mainevma_profiles.jsonl
        ├── output_mainevma_profiles.csv
        └── debug_page1.png             # Auto-saved if DOM fallback triggers
```

---

## Configuration (`config.js`)

| Key                          | Default   | Description                              |
|------------------------------|-----------|------------------------------------------|
| `browser.executablePath`     | see file  | Path to Chromium binary                  |
| `browser.headless`           | `true`    | Run browser headlessly                   |
| `browser.networkIdleTimeout` | `8000`    | ms to wait for Angular XHR to finish     |
| `browser.pageLoadTimeout`    | `30000`   | Max ms to wait for initial page load     |
| `crawl.pageDelay`            | `1500`    | ms between page clicks (be polite)       |
| `crawl.maxRetries`           | `3`       | Retry attempts per operation             |
| `crawl.retryBaseDelay`       | `2000`    | Base ms for exponential backoff          |

---

## Observations & Notes

- **Access level:** Fully public — no login required for the Find a Vet directory.
- **Anti-scraping:** No CAPTCHA or rate limiting observed. Playwright's default browser fingerprint is sufficient.
- **Data freshness:** MemberClicks directories are member-maintained; data accuracy varies per listing.
- **Field variability:** Not all members fill every field (website, certifications, vet school are optional). The CSV header is the union of all encountered keys across all members.
- **MemberClicks platform:** This same scraper pattern (JSON interception + DOM fallback) works for other state VMA sites also running MemberClicks `com_mcdirectorysearch`.

