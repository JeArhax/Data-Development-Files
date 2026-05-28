# Vermont DOH Veterinary License Scraper

Documentation-compliant scraper for Vermont Department of Health veterinary professional licenses.

## Project Structure

```
dohenterprise.my.site.com/
├── config.js                                          # Configuration
├── main_dohenterprise.my.site.com.js                 # Main entry point
├── package.json                                       # Dependencies
├── .gitignore                                         # Git ignore rules
├── src/
│   ├── parsers/
│   │   └── dohenterprise.my.site.com/
│   │       └── parsers.js                            # Search page parsing functions
│   ├── processors/
│   │   └── urlProcessors_dohenterprise.my.site.com.js # Orchestration logic
│   ├── services/
│   │   └── dohenterprise.my.site.com/
│   │       └── client.js                             # Browser management
│   └── utils/
│       ├── async.js                                   # Async utilities
│       ├── transforms.js                              # Data transformation
│       ├── loggers.js                                 # Logging utility
│       └── errors.js                                  # Error handling
└── output/                                            # Generated output files
    ├── dohenterprise.my.site.com_profiles_2026.jsonl
    └── dohenterprise.my.site.com_profiles_2026.csv
```

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

Or:

```bash
node main_dohenterprise.my.site.com.js
```

## Features

✅ Loops through all license statuses (Active, Inactive, Expired, Suspended, Revoked)
✅ Deduplicates by license number
✅ Documentation-compliant field naming (camelCase)
✅ Includes required metadata (sourceUrl, currentPageUrl, scrapedAt)
✅ Modular, maintainable code structure
✅ Error handling and recovery
✅ Outputs JSONL + CSV formats

## Configuration

Edit `config.js` to modify:
- Statuses to scrape
- License types
- Delays between requests
- Selectors

## Output Fields

- fullName
- licenseNumber
- licenseType
- status
- issueDate
- expirationDate
- tempLicenseIssueDate
- sourceUrl
- currentPageUrl
- scrapedAt
