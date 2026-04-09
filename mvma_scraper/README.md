# mvma.org — Find-a-Vet Directory Scraper

**Source:** [https://www.mvma.org/find-a-vet](https://www.mvma.org/find-a-vet)
**VMA:** Minnesota Veterinary Medical Association (MVMA)
**Access Level:** Public
**Approach:** Playwright HTML — listing-only (no profile phase)
**Last Documented:** 2025

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack & Justification](#2-technology-stack--justification)
3. [Source Inspection & Discovery](#3-source-inspection--discovery)
4. [Data Schema](#4-data-schema)
5. [Project Structure](#5-project-structure)
6. [Setup & Installation](#6-setup--installation)
7. [Usage](#7-usage)
8. [Crawling & Pagination Logic](#8-crawling--pagination-logic)
9. [Error Handling](#9-error-handling)
10. [Output Format & Samples](#10-output-format--samples)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Project Overview

Scrapes the full public member directory from MVMA's "Find a Vet" page.

### Why listing-only (no profile phase)

The listing cards already expose all business-critical fields:

| Field | Available in listing? |
|---|---|
| Full Name | ✅ |
| Clinic / Organization | ✅ |
| Street Address | ✅ |
| City, State, Zip | ✅ |
| Business Type | ✅ |
| Phone | ✅ |
| Website | ✅ |
| Species Seen | ✅ |
| Skills / Special Interests | ✅ |
| Practice Offers | ✅ |
| Discounts / Special Programs | ❌ profile-only |
| Degrees / Certifications | ❌ profile-only (mostly "None") |

Discounts and Degrees were evaluated and skipped — they are sparse (majority "None") and would require ~555 additional browser navigations. The listing gives ~95% of the data in a single pass.

### Scale

- **~555 total records** (confirmed from live DOM: "555 results")
- **10 records per page** → ~56 pages
- Estimated full run time: **~5–8 minutes** at 1.2s delay per page

---

## 2. Technology Stack & Justification

### Language: Node.js

Consistent with project boilerplate. Async/await maps cleanly to Playwright's API.

### Library: `playwright` (Chromium)

| | |
|---|---|
| **Why needed** | The Find-a-Vet page is an **Angular 16 SPA** (confirmed: `ng-version="16.2.12"`). Pagination is handled entirely client-side via Angular Material paginator — clicking Next re-renders cards in-place. No URL change, no network request to intercept. A real browser is required. |
| **Advantages** | Reliable DOM access after Angular renders; handles JS-heavy SPAs natively; can detect disabled Next button for clean termination |
| **Disadvantages** | Slower than API/axios; heavier resource use; Chromium binary required |
| **Alternatives considered** | axios (no good — listing pagination has no interceptable XHR); Puppeteer (equivalent, Playwright preferred for better API) |

### Library: `linkedom`

| | |
|---|---|
| **Why needed** | Fast server-side HTML parsing for card innerHTML. Avoids running selectors on the live Playwright page card-by-card (slow). We extract all card innerHTML at once, then parse offline. |
| **Advantages** | Lightweight; DOM-compatible API (querySelector works as-is); no native dependencies |
| **Alternatives** | `cheerio` (jQuery-style, also fine); `node-html-parser` (faster but less API-compatible) |

---

## 3. Source Inspection & Discovery

### How the page works

```
https://www.mvma.org/find-a-vet
  └── Embeds Angular app from:
      mvma.memberclicks.net/ui-directory-search/v2/public-v2/dist/
        ├── runtime.js
        ├── polyfills.js
        └── main.js   ← Angular 16 SPA bundle
```

The Angular app renders member cards directly into the DOM. Pagination is Angular Material's `<mat-paginator>` — no network request is made when clicking Next.

### Card DOM structure

```html
<div class="card">
  <div class="card__content">

    <div class="content-contact-name">Deborah Adams</div>

    <div class="content-middle">
      <div class="content-middle__left">
        <span><strong>Southdale Pet Hospital</strong></span>   ← clinic name
        <span>3910 W 70th St.</span>                           ← street address
        <span>Edina MN 55435</span>                            ← city/state/zip
      </div>
      <div class="content-middle__right">
        <span>Small Animal Exclusive</span>                    ← business type
        <span>9529261831</span>                                ← phone
        <span>http://www.southdalepethospital.com</span>       ← website
      </div>
    </div>

    <div class="content-bottom">
      <span><hr></span>                                        ← divider (skip)
      <span>Canine, Feline</span>                             ← species
      <span>Dentistry, Internal Medicine, Surgery</span>      ← skills
      <span>Wellness Programs</span>                          ← practice offers
    </div>

  </div>
</div>
```

### Paginator

```html
<!-- Total shown in: -->
<p class="result-count-text">555 results</p>

<!-- Current range: -->
<div class="mat-mdc-paginator-range-label">1 – 10 of 555</div>

<!-- Next page button (disabled attr present on last page): -->
<button class="mat-mdc-paginator-navigation-next" [disabled]>
```

### Observed data quirks

| Quirk | Handling |
|---|---|
| Some members have no address | `companyAddress`, `companyCity`, etc. → `null` |
| Phone/website sometimes blank (empty `<span>`) | → `null` |
| Species duplicated: `"Canine, Feline, Canine, Feline"` | Deduplicated on parse |
| Skills has combo entries: `"Internal Medicine, Pain Management"` alongside individuals | Preserved as-is (source intent) |
| Practice Offers 4th span absent on some cards | → `null` |

---

## 4. Data Schema

### Output fields

| Field | Source location | Notes |
|---|---|---|
| `fullName` | `.content-contact-name` | e.g. `"Deborah Adams"` |
| `companyName` | `.content-middle__left span[0] > strong` | Clinic/hospital name |
| `companyType` | `.content-middle__right span[0]` | e.g. `"Small Animal Exclusive"` |
| `companyPhone` | `.content-middle__right span[1]` | Raw string (may lack formatting) |
| `companyWebsiteUrl` | `.content-middle__right span[2]` | Raw URL as entered by member |
| `companyAddress` | `.content-middle__left span[1]` | Street only |
| `companyCity` | Parsed from `.content-middle__left span[2]` | e.g. `"Edina"` |
| `companyState` | Parsed from `.content-middle__left span[2]` | e.g. `"MN"` |
| `companyZip` | Parsed from `.content-middle__left span[2]` | e.g. `"55435"` |
| `companyLocation` | Composite: address + city/state/zip | Full address string |
| `profileSpecies` | `.content-bottom span[1]` | Array, deduplicated |
| `profileSkills` | `.content-bottom span[2]` | Array |
| `profilePracticeOffers` | `.content-bottom span[3]` | Array, or `null` |
| `sourceUrl` | — | Always `"mvma.org"` |
| `currentPageUrl` | — | `"https://www.mvma.org/find-a-vet"` |
| `scrapedAt` | — | ISO 8601 timestamp |

### Business Type values (observed)

- Small Animal Exclusive
- Small Animal/Exotic Practice
- Mixed Animal Practice
- Referral/Specialty Center
- Specialty - Mobile

---

## 5. Project Structure

```
mvma.org/
├── main_mvma.js                           # Entry point
├── package.json
├── .gitignore
│
├── src/
│   ├── config.js                          # Selectors, timeouts, output config
│   │
│   ├── parsers/
│   │   └── mvma.org/
│   │       └── parsers.js                # parseCard(), parseCards()
│   │
│   ├── processors/
│   │   └── urlProcessors_mvma.org.js     # crawlAll(), exportResults()
│   │
│   ├── services/
│   │   └── mvma.org/
│   │       └── client.js                 # Playwright browser control
│   │
│   └── utils/
│       ├── async.js                      # timeWaitFor()
│       ├── errors.js                     # NetworkError, ParseError
│       ├── loggers.js                    # Levelled logger
│       └── transforms.js                # flattenObject(), toCamelCase()
│
└── no-sync/                              # Git-ignored
    └── output/
        ├── output_mvma.org_vets_YYYY-MM-DD.jsonl
        └── output_mvma.org_vets_YYYY-MM-DD.csv
```

---

## 6. Setup & Installation

```bash
cd mvma.org
npm install
npx playwright install chromium
```

Requirements: Node.js ≥ 18

---

## 7. Usage

### Test run (first 3 pages = ~30 records)
```bash
npm run test-run
# or: node main_mvma.js --pages 3
```
**Always verify first results manually before a full run.**
Check ~5 records against the live site: name, clinic, address, phone, species all correct.

### Full run (~555 records)
```bash
npm start
# or: node main_mvma.js
```

### Debug with visible browser
```bash
npm run debug
# or: node main_mvma.js --pages 2 --headful
```
Use `--headful` if selectors appear to be missing (lets you watch what the browser sees).

### Tune config
Edit `src/config.js`:

| Key | Default | Purpose |
|---|---|---|
| `PLAYWRIGHT_HEADLESS` | `true` | Set `false` to watch browser |
| `RENDER_WAIT` | `1500ms` | Increase if Angular renders slowly |
| `DELAY_BETWEEN_PAGES` | `1200ms` | Polite delay between page turns |
| `MAX_EMPTY_PAGES` | `3` | Safety stop on consecutive empty pages |

---

## 8. Crawling & Pagination Logic

```
openDirectory()
  └── goto mvma.org/find-a-vet
  └── waitForSelector('div.card')   ← Angular rendered
  └── wait RENDER_WAIT ms

loop:
  getPageCards()    → all .card innerHTML[]  on current view
  parseCards()      → structured records[]
  getPaginatorInfo() → log "1–10 of 555"
  goNextPage()
    → read Next button disabled attr
    → if disabled: return false → break loop
    → click Next
    → waitForFunction: first card name changed  (Angular re-render detection)
    → wait DELAY_BETWEEN_PAGES ms
    → return true → continue loop
```

---

## 9. Error Handling

| Scenario | Behaviour |
|---|---|
| Page load timeout | Fatal `NetworkError` — exit with code 1 |
| Cards not found after load | Fatal `NetworkError` with diagnostic message |
| `getPageCards()` fails mid-crawl | Log error, treat page as empty, continue |
| Individual card parse error | Log error, save `{ rawParseError, rawCardHtml }` fallback record |
| `goNextPage()` throws | Log error, stop crawl — export what was collected |
| Too many consecutive empty pages | Stop gracefully after `MAX_EMPTY_PAGES` |

Parse errors produce a fallback record with `rawParseError` and `rawCardHtml` (first 500 chars) so no record is silently lost and the raw HTML is available for manual recovery.

---

## 10. Output Format & Samples

### JSONL

```jsonl
{"fullName":"Deborah Adams","companyName":"Southdale Pet Hospital","companyType":"Small Animal Exclusive","companyPhone":"9529261831","companyWebsiteUrl":"http://www.southdalepethospital.com","companyAddress":"3910 W 70th St.","companyCity":"Edina","companyState":"MN","companyZip":"55435","companyLocation":"3910 W 70th St., Edina MN 55435","profileSpecies":["Canine","Feline"],"profileSkills":["Dentistry","Internal Medicine","Surgery"],"profilePracticeOffers":["Wellness Programs"],"sourceUrl":"mvma.org","currentPageUrl":"https://www.mvma.org/find-a-vet","scrapedAt":"2025-01-07T10:30:00.000Z"}
{"fullName":"Kyle Adkins","companyName":"Country Doc Veterinary Clinic","companyType":"Mixed Animal Practice","companyPhone":"218-587-4196","companyWebsiteUrl":"http://www.veterinariancountrydocpineriver.com","companyAddress":"5508 County Road 1","companyCity":"Pine River","companyState":"MN","companyZip":"56474","companyLocation":"5508 County Road 1, Pine River MN 56474","profileSpecies":["Amphibian/Reptiles","Avian (not Poultry)","Avian (Poultry)","Bovine","Camelid","Canine","Cervid","Equine","Feline","Ovine/Caprine","Pocket Pets"],"profileSkills":["Dentistry","Dermatology","Emergency / Critical Care","Internal Medicine","Ophthalmology","Radiology","Surgery"],"profilePracticeOffers":["Wellness Programs","Farm Calls (Large Animal)","House Calls (Small Animal)","Laser Therapy"],"sourceUrl":"mvma.org","currentPageUrl":"https://www.mvma.org/find-a-vet","scrapedAt":"2025-01-07T10:30:01.000Z"}
{"fullName":"Chloe Adams","companyName":"Inver Grove Heights Animal Hospital","companyType":"Small Animal Exclusive","companyPhone":null,"companyWebsiteUrl":null,"companyAddress":null,"companyCity":null,"companyState":null,"companyZip":null,"companyLocation":null,"profileSpecies":["Canine","Feline"],"profileSkills":["Acupuncture","Alternative Medicine","Behavior / Socialization","Chiropractic","Dentistry","Fertility / Reproduction","Internal Medicine","Nutrition","Orthopedics","Pain Management","Surgery","Internal Medicine, Pain Management"],"profilePracticeOffers":null,"sourceUrl":"mvma.org","currentPageUrl":"https://www.mvma.org/find-a-vet","scrapedAt":"2025-01-07T10:30:02.000Z"}
```

### CSV

Arrays are comma-joined into a single cell.

```csv
fullName,companyName,companyType,companyPhone,companyWebsiteUrl,companyAddress,companyCity,companyState,companyZip,companyLocation,profileSpecies,profileSkills,profilePracticeOffers,sourceUrl,currentPageUrl,scrapedAt
Deborah Adams,Southdale Pet Hospital,Small Animal Exclusive,9529261831,http://www.southdalepethospital.com,3910 W 70th St.,Edina,MN,55435,"3910 W 70th St., Edina MN 55435","Canine, Feline","Dentistry, Internal Medicine, Surgery",Wellness Programs,mvma.org,https://www.mvma.org/find-a-vet,2025-01-07T10:30:00.000Z
Kyle Adkins,Country Doc Veterinary Clinic,Mixed Animal Practice,218-587-4196,http://www.veterinariancountrydocpineriver.com,5508 County Road 1,Pine River,MN,56474,"5508 County Road 1, Pine River MN 56474","Amphibian/Reptiles, Avian (not Poultry), Bovine, Canine, Equine, Feline","Dentistry, Surgery","Wellness Programs, Farm Calls (Large Animal)",mvma.org,https://www.mvma.org/find-a-vet,2025-01-07T10:30:01.000Z
Chloe Adams,Inver Grove Heights Animal Hospital,Small Animal Exclusive,,,,,,,,"Canine, Feline","Acupuncture, Alternative Medicine, Surgery",,mvma.org,https://www.mvma.org/find-a-vet,2025-01-07T10:30:02.000Z
```

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Timed out waiting for directory cards` | Angular app failed to load | Run `--headful` to inspect; check if site requires cookies/consent popup |
| All records have `null` fields | Selectors changed | Run `--headful --pages 1`, inspect DOM, update `config.js` SELECTORS |
| Species/skills not parsed | `.content-bottom` span order changed | Check `bottomSpans` index mapping in `parsers.js` |
| Pagination stops early | Angular re-render detection too strict | Increase `RENDER_WAIT` in `config.js` |
| Empty `companyCity/State/Zip` | City/state/zip format differs | Check `parseCityStateZip()` regex in `parsers.js`; format is `"City ST Zip"` |
| Duplicate species values | Expected — handled by dedup | No action needed |
