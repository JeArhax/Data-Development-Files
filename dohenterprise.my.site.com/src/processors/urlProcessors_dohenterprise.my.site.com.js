const client = require("../services/dohenterprise.my.site.com/client");
const parsers = require("../parsers/dohenterprise.my.site.com/parsers");
const config = require("../../config");
const logger = require("../utils/loggers");
const fs = require("fs");
const path = require("path");

// Helper to generate search seeds
function generateLastNameSeeds() {
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  const combos = [...letters];
  for (let a of letters) {
    for (let b of letters) combos.push(a + b);
  }
  return combos;
}

// Output paths
const outputDir = path.join(__dirname, "..", "..", "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const jsonlPath = path.join(outputDir, "dohenterprise.my.site.com_profiles_2026.jsonl");
const csvPath = path.join(outputDir, "dohenterprise.my.site.com_profiles_2026.csv");

const ALL_FIELDS = [
  "fullName",
  "licenseNumber",
  "licenseType",
  "status",
  "issueDate",
  "expirationDate",
  "tempLicenseIssueDate",
  "sourceUrl",
  "currentPageUrl",
  "scrapedAt",
];

function writeJSONL(obj) {
  fs.appendFileSync(jsonlPath, JSON.stringify(obj) + "\n");
}

let headerWritten = false;
function writeCSV(obj) {
  if (!headerWritten) {
    fs.writeFileSync(csvPath, ALL_FIELDS.join(",") + "\n");
    headerWritten = true;
  }
  const row = ALL_FIELDS.map(field => {
    const value = obj[field] || '';
    return `"${String(value).replace(/"/g, '""')}"`;
  }).join(",");
  fs.appendFileSync(csvPath, row + "\n");
}

module.exports = {
  processDOH: async () => {
    const page = await client.initBrowser();
    await page.goto(config.baseUrl, { waitUntil: "networkidle0" });

    const seeds = generateLastNameSeeds();
    logger.log(`Total seeds: ${seeds.length}`);
    logger.log(`Statuses to scrape: ${config.statuses.join(", ")}`);

    const seen = new Set();
    let totalNewRecords = 0;

    for (const status of config.statuses) {
      logger.log(`\n${"=".repeat(50)}`);
      logger.log(`SCRAPING STATUS: ${status}`);
      logger.log(`${"=".repeat(50)}\n`);

      for (const seed of seeds) {
        try {
          // Fill and submit search form
          await parsers.fillSearchForm(page, {
            profession: config.profession,
            licenseType: config.licenseTypes[0],
            status: status,
            lastName: seed,
          });

          await parsers.clickSearch(page);

          // Parse results
          const records = await parsers.parseResultsTable(page);

          // Write unique records
          let newCount = 0;
          for (const rec of records) {
            if (!rec.licenseNumber) continue;
            
            if (!seen.has(rec.licenseNumber)) {
              seen.add(rec.licenseNumber);
              writeJSONL(rec);
              writeCSV(rec);
              newCount++;
              totalNewRecords++;
            }
          }

          if (newCount > 0) {
            logger.success(`[${status}] Found ${newCount} new records for ${seed}`);
          }

          // Click "Search Again"
          await parsers.clickSearchAgain(page);

        } catch (err) {
          logger.error(`[${status}] Error processing ${seed}: ${err.message}`);
          
          // Try to recover
          try {
            await parsers.clickSearchAgain(page);
          } catch {}
        }
      }

      logger.log(`\nCompleted status: ${status}`);
      logger.log(`Total unique records so far: ${seen.size}\n`);
    }

    await client.closeBrowser();
    
    logger.log(`\n${"=".repeat(60)}`);
    logger.log(`SCRAPING COMPLETED`);
    logger.log(`${"=".repeat(60)}`);
    logger.success(`Total unique records: ${seen.size}`);
    logger.success(`New records added: ${totalNewRecords}`);
    logger.log(`Output files:`);
    logger.log(`  - ${jsonlPath}`);
    logger.log(`  - ${csvPath}`);
  },
};
