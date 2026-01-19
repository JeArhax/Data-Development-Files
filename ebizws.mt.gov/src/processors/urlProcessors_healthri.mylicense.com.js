const fs = require("fs");
const path = require("path");
const { wait } = require("../utils/async");
const { log } = require("../utils/loggers");
const { parseSearchResults } = require("../parsers/healthri.mylicense.com/parsers");
const { createJsonlWriter, createCsvWriter } = require("../utils/output");
const config = require("../config");

const OUTPUT_JSONL = path.join(
  __dirname,
  "../../output/output_healthri_profiles_2026.jsonl"
);
const OUTPUT_CSV = path.join(
  __dirname,
  "../../output/output_healthri_profiles_2026.csv"
);

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

// ----------------------------
// Load already extracted license numbers
// ----------------------------
const extractedRows = new Set();
if (fs.existsSync(OUTPUT_JSONL)) {
  const existingData = fs.readFileSync(OUTPUT_JSONL, "utf-8").split("\n");
  for (const line of existingData) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.licenseNumber) extractedRows.add(obj.licenseNumber);
    } catch (err) {
      // ignore malformed lines
    }
  }
}

async function processHealthRI(page) {
  const jsonlWriter = createJsonlWriter(OUTPUT_JSONL, { append: true });
  const csvWriter = createCsvWriter(OUTPUT_CSV, CSV_HEADERS, { append: true });

  for (const letter of config.letters) {
    log(`🔤 Searching letter: ${letter}`);

    // Select profession
    await page.select("#t_web_lookup__profession_name", config.profession);
    await wait(config.delayMs);

    // Type last name letter
    await page.evaluate(() => {
      document.querySelector("#t_web_lookup__last_name").value = "";
    });
    await page.type("#t_web_lookup__last_name", letter);
    await wait(config.delayMs);

    // Submit search
    await page.click("#sch_button");
    await page.waitForSelector("#datagrid_results tr", { timeout: 15000 });
    await wait(config.delayMs);

    // ----------------------------
    // Pagination loop
    // ----------------------------
    const visitedPages = new Set();
    let pageNumber = 1;
    let letterHasNewRows = false;

    while (true) {
      log(`📄 Scraping page ${pageNumber} for letter ${letter}`);
      const rows = await parseSearchResults(page);
      log(`📄 Found ${rows.length} rows`);

      let newRowsOnPage = 0;

      // Save table data
      for (const row of rows) {
        if (!row.licenseNumber || extractedRows.has(row.licenseNumber)) continue;

        const record = {
          ...row,
          sourceUrl: "healthri.mylicense.com",
          currentPageUrl: page.url(),
          scrapedAt: new Date().toISOString(),
        };

        extractedRows.add(row.licenseNumber);
        jsonlWriter.write(record);
        csvWriter.write(record);

        newRowsOnPage++;
        log(`✅ Saved: ${record.fullName}`);
      }

      if (newRowsOnPage > 0) letterHasNewRows = true;

      visitedPages.add(pageNumber);

      // Find next unvisited page
      const nextPageLink = await page.$$eval(
        "#datagrid_results td a[href^='javascript:__doPostBack']",
        links =>
          links
            .map(a => ({
              href: a.getAttribute("href"),
              number: parseInt(a.innerText.trim(), 10)
            }))
            .filter(p => !isNaN(p.number))
      );

      const nextPage = nextPageLink.find(p => !visitedPages.has(p.number));

      if (!nextPage) {
        log("⛔ No more new pages for this letter");
        break;
      }

      log(`➡️ Clicking next page: ${nextPage.number}`);
      await page.evaluate(href => eval(href), nextPage.href);
      await page.waitForSelector("#datagrid_results tr", { timeout: 10000 });
      await wait(config.delayMs + Math.floor(Math.random() * 500));

      pageNumber++;
    }

    // ----------------------------
    // Reset search for next letter
    // ----------------------------
    if (letterHasNewRows) {
      log("🔄 Resetting search for next letter...");
      await page.evaluate(() => {
        document.querySelector("#my_button").click();
      });
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });
      await wait(config.delayMs);
    } else {
      log(`ℹ️ Letter ${letter} already fully scraped, skipping reset`);
    }
  }

  jsonlWriter.close();
  csvWriter.close();
  log("📦 Output files completed.");
}

module.exports = { processHealthRI };
