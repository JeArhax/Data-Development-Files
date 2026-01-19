const path = require("path");
const fs = require("fs");
const { processMopro } = require("./processors/urlProcessors_mopro.mo.gov");
const { createJsonlWriter, createCsvWriter } = require("./utils/output");
const logger = require("./utils/loggers");

(async () => {
  try {
    const results = await processMopro();

    if (!results.length) {
      logger.log("No results found.");
      return;
    }

    // Make sure the output folder exists
    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      logger.log(`Created output folder at ${outputDir}`);
    }

    // File paths
    const OUTPUT_JSONL = path.join(outputDir, "mopro_profiles_2026.jsonl");
    const OUTPUT_CSV = path.join(outputDir, "mopro_profiles_2026.csv");

    // CSV headers
    const CSV_HEADERS = [
      "fullName",
      "licenseNumber",
      "profession",
      "licenseType",
      "licenseStatus",
      "city",
      "state",
      "profileUrl",
      "sourceUrl",
      "currentPageUrl",
      "scrapedAt",
    ];

    // Create writers
    const jsonlWriter = createJsonlWriter(OUTPUT_JSONL);
    const csvWriter = createCsvWriter(OUTPUT_CSV, CSV_HEADERS);

    // Write each record
    results.forEach((record) => {
      jsonlWriter.write(record);
      csvWriter.write(record);
    });

    // Close writers
    jsonlWriter.close();
    csvWriter.close();

    logger.log(`Scraping complete! Total records: ${results.length}`);
    logger.log(`Files saved: ${OUTPUT_JSONL}, ${OUTPUT_CSV}`);
  } catch (err) {
    logger.log("Fatal error:", err);
  }
})();
