const client = require("../services/oop.ky.gov/client");
const parsers = require("../parsers/oop.ky.gov/parsers");
const config = require("../../config");
const logger = require("../utils/loggers");
const { wait } = require("../utils/async");
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

const jsonlPath = path.join(outputDir, "oop.ky.gov_profiles_2026.jsonl");
const csvPath = path.join(outputDir, "oop.ky.gov_profiles_2026.csv");
const progressFile = path.join(outputDir, "progress.json");

const ALL_FIELDS = [
  "fullName",
  "boardName",
  "licenseType",
  "legacyNumber",
  "licenseNumber",
  "disciplinaryActions",
  "status",
  "issueDate",
  "expirationDate",
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

// Progress tracking
function loadProgress() {
  if (fs.existsSync(progressFile)) {
    return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  }
  return { lastSeedIndex: -1, seenLicenses: [] };
}

function saveProgress(seedIndex, seenLicenses) {
  fs.writeFileSync(progressFile, JSON.stringify({
    lastSeedIndex: seedIndex,
    seenLicenses: Array.from(seenLicenses)
  }, null, 2));
}

module.exports = {
  processKentucky: async () => {
    const page = await client.initBrowser();
    await page.goto(config.baseUrl, { waitUntil: "networkidle0" });

    const seeds = generateLastNameSeeds();
    const progress = loadProgress();
    const seen = new Set(progress.seenLicenses);
    
    let startIndex = progress.lastSeedIndex + 1;
    if (startIndex > 0) {
      logger.log(`Resuming from seed index ${startIndex} (${seeds[startIndex]})`);
    }

    logger.log(`Total seeds: ${seeds.length}`);
    logger.log(`Seeds to process: ${seeds.length - startIndex}`);
    logger.log(`Statuses to scrape: ${config.statuses.join(", ") || "All"}`);

    let totalNewRecords = 0;

    // Setup board checkbox (one time)
    await parsers.setupBoardCheckbox(page);

    for (const status of config.statuses) {
      logger.log(`\n${"=".repeat(50)}`);
      logger.log(`SCRAPING STATUS: ${status || 'All'}`);
      logger.log(`${"=".repeat(50)}\n`);

      // Select status
      await parsers.selectStatus(page, status);

      for (let i = startIndex; i < seeds.length; i++) {
        const seed = seeds[i];
        logger.log(`[${status || 'All'}] Searching seed: ${seed}`);

        try {
          // Search
          await parsers.searchByLastName(page, seed);

          // Parse results
          const records = await parsers.parseResults(page);

          // Write unique records
          let newCount = 0;
          let dupCount = 0;
          for (const rec of records) {
            if (!rec.licenseNumber) continue;
            
            if (!seen.has(rec.licenseNumber)) {
              seen.add(rec.licenseNumber);
              writeJSONL(rec);
              writeCSV(rec);
              newCount++;
              totalNewRecords++;
            } else {
              dupCount++;
            }
          }

          if (newCount > 0) {
            logger.success(`[${status || 'All'}] Found ${newCount} new records for ${seed}`);
          }
          if (dupCount > 0) {
            logger.log(`[${status || 'All'}] Skipped ${dupCount} duplicates for ${seed}`);
          }

          // Save progress
          saveProgress(i, seen);

          await wait(config.delays.betweenSeeds);

        } catch (err) {
          logger.error(`[${status || 'All'}] Error processing ${seed}: ${err.message}`);
          saveProgress(i, seen);
          await wait(1500);
        }
      }

      logger.log(`\nCompleted status: ${status || 'All'}`);
      logger.log(`Total unique records so far: ${seen.size}\n`);
      
      // Reset start index for next status
      startIndex = 0;
    }

    await client.closeBrowser();
    
    // Clear progress on completion
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
    }
    
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
