const client = require("../services/mopro.mo.gov/client");
const parsers = require("../parsers/mopro.mo.gov/parsers");
const config = require("../config");
const { randomWait } = require("../utils/async");
const logger = require("../utils/loggers");
const fs = require("fs");
const path = require("path");

module.exports = {
  processMopro: async () => {
    const page = await client.initBrowser();
    await page.goto(config.baseUrl, { waitUntil: "networkidle" });
    await randomWait(1000, 1500);

    await parsers.selectProfessions(page);
    // DON'T select search by name - just search all

    const seen = new Set();

    const outputDir = path.join(__dirname, "..", "..", "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const outputJsonl = path.join(outputDir, "mopro_profiles_2026.jsonl");
    const outputCsv = path.join(outputDir, "mopro_profiles_2026.csv");
    const progressFile = path.join(outputDir, "progress.json");

    let csvHeaderWritten = fs.existsSync(outputCsv);

    const ALL_FIELDS = [
      "licenseeName",
      "licenseNumber",
      "professionName",
      "cityDetail",
      "stateDetail",
      "postalCode",
      "county",
      "expirationDate",
      "originalIssueDate",
      "currentDisciplineStatus",
      "previousDisciplinaryActions",
      "scrapedAt",
    ];

    // Load progress
    let progress = { lastPage: 0, totalRecords: 0, seenLicenses: [] };
    
    // Load existing licenses from JSONL file if it exists
    logger.log(`🔍 Checking for existing JSONL file at: ${outputJsonl}`);
    logger.log(`📁 File exists: ${fs.existsSync(outputJsonl)}`);
    
    if (fs.existsSync(outputJsonl)) {
      logger.log(`📂 Loading existing licenses from JSONL file...`);
      try {
        const fileContent = fs.readFileSync(outputJsonl, 'utf8');
        logger.log(`📄 File size: ${fileContent.length} bytes`);
        
        const existingData = fileContent.split('\n').filter(line => line.trim());
        logger.log(`📋 Found ${existingData.length} lines in JSONL`);
        
        existingData.forEach((line, index) => {
          try {
            const record = JSON.parse(line);
            if (record.licenseNumber) {
              seen.add(record.licenseNumber);
            } else if (record.licenseeName) {
              // Old format compatibility
              seen.add(record.licenseeName);
            }
          } catch (err) {
            logger.log(`⚠️ Error parsing line ${index + 1}: ${err.message}`);
          }
        });
        logger.log(`✅ Loaded ${seen.size} existing licenses from JSONL`);
      } catch (err) {
        logger.log(`❌ Error reading JSONL file: ${err.message}`);
      }
    } else {
      logger.log(`⚠️ No existing JSONL file found, starting fresh`);
    }
    
    if (fs.existsSync(progressFile)) {
      try {
        progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        
        // Ensure all fields exist with defaults
        progress.lastPage = progress.lastPage || 0;
        progress.totalRecords = progress.totalRecords || 0;
        progress.seenLicenses = progress.seenLicenses || [];
        
        logger.log(`📂 Resuming from page ${progress.lastPage}`);
        logger.log(`📊 Previously extracted: ${progress.totalRecords} records`);
        logger.log(`📋 Loading ${progress.seenLicenses.length} previously seen license numbers`);
        
        // Restore seen Set
        progress.seenLicenses.forEach(license => seen.add(license));
      } catch (err) {
        logger.log(`⚠️ Progress file corrupted, starting fresh: ${err.message}`);
        fs.renameSync(progressFile, progressFile + '.corrupted');
        progress = { lastPage: 0, totalRecords: 0, seenLicenses: [] };
      }
    }

    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    try {
      // ===== SUBMIT SEARCH (NO NAME FILTER) =====
      logger.log(`🔍 Submitting search for all records...`);
      
      await page.locator('button.slds-button_brand', { hasText: "Submit" }).click();
      await page.waitForSelector("table.licensee-table tbody tr");
      await randomWait(800, 1200);

      let pageNumber = 1;

      // If resuming, navigate to the last page
      if (progress.lastPage > 0) {
        logger.log(`⏭️ Skipping to page ${progress.lastPage + 1}...`);
        
        for (let skipPage = 1; skipPage <= progress.lastPage; skipPage++) {
          const nextBtn = page.locator('lightning-button-icon.nextButtonClass button[title="next"]');
          
          if (await nextBtn.count() === 0 || await nextBtn.first().isDisabled().catch(() => true)) {
            logger.log(`⚠️ Could not navigate to page ${progress.lastPage + 1}, starting from page ${skipPage}`);
            pageNumber = skipPage;
            break;
          }
          
          await nextBtn.first().click();
          await randomWait(2000, 2500);
          await page.waitForSelector('table.licensee-table tbody tr', { timeout: 20000 });
          await randomWait(500, 800);
        }
        
        pageNumber = progress.lastPage + 1;
        logger.log(`✅ Resumed at page ${pageNumber}`);
      }

      // ===== PAGINATION LOOP =====
      while (true) {
        // Check if we should stop due to errors
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.log(`\n🛑 STOPPING: ${MAX_CONSECUTIVE_ERRORS} consecutive errors detected`);
          logger.log(`📊 Last successful page: ${progress.lastPage}`);
          logger.log(`📊 Total records extracted: ${progress.totalRecords}`);
          logger.log(`💾 Progress saved. Run again to resume from page ${progress.lastPage + 1}`);
          break;
        }

        logger.log(`\n📄 Processing Page ${pageNumber}`);
        
        try {
          const results = await parsers.parseResultsTable(page, `Page ${pageNumber}`);

          logger.log(`📥 Extracted ${results.length} profiles from page`);
          
          let duplicateCount = 0;
          let noLicenseCount = 0;
          
          const cleanResults = results.filter(r => {
            if (!r.licenseNumber) {
              noLicenseCount++;
              logger.log(`⚠️ Profile has no license number: ${r.licenseeName}`);
              return false;
            }
            if (seen.has(r.licenseNumber)) {
              duplicateCount++;
              logger.log(`🔄 Duplicate license: ${r.licenseNumber} (${r.licenseeName})`);
              return false;
            }
            seen.add(r.licenseNumber);
            return true;
          });

          logger.log(`📊 Results: ${cleanResults.length} new, ${duplicateCount} duplicates, ${noLicenseCount} missing license`);

          if (cleanResults.length) {
            logger.log(`✅ Page ${pageNumber}: ${cleanResults.length} records`);

            cleanResults.forEach(r =>
              fs.appendFileSync(outputJsonl, JSON.stringify(r) + "\n")
            );

            if (!csvHeaderWritten) {
              fs.writeFileSync(outputCsv, ALL_FIELDS.join(",") + "\n");
              csvHeaderWritten = true;
            }

            cleanResults.forEach(r => {
              const row = ALL_FIELDS.map(f => `"${r[f] || ""}"`).join(",");
              fs.appendFileSync(outputCsv, row + "\n");
            });

            // Update progress
            progress.totalRecords += cleanResults.length;
          } else {
            logger.log(`⏭️ Page ${pageNumber}: All duplicates, skipping save`);
          }
          
          // Reset error counter on success
          consecutiveErrors = 0;
          
          // ALWAYS save progress after each page (even if all duplicates)
          progress.lastPage = pageNumber;
          progress.seenLicenses = Array.from(seen);
          fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
          logger.log(`💾 Progress saved: page ${pageNumber}, total: ${progress.totalRecords} records`);

        } catch (err) {
          consecutiveErrors++;
          logger.log(`❌ Failed for page ${pageNumber}: ${err.message}`);
          logger.log(`⚠️ Consecutive errors: ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}`);
          
          // Save progress even on error
          progress.seenLicenses = Array.from(seen);
          fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
        }

        // ====== CHECK FOR NEXT PAGE ======
        // Give page time to stabilize before checking pagination
        await randomWait(2000, 3000);
        
        const nextBtn = page.locator(
          'lightning-button-icon.nextButtonClass button[title="next"]'
        );

        const nextBtnCount = await nextBtn.count();
        logger.log(`🔘 Next button count: ${nextBtnCount}`);
        
        if (nextBtnCount === 0) {
          logger.log(`⛔ Next button not found - end of results`);
          break;
        }

        const isDisabled = await nextBtn.first().isDisabled().catch(() => true);
        logger.log(`🔘 Next button disabled: ${isDisabled}`);
        
        if (isDisabled) {
          logger.log(`⛔ Next button disabled - end of results`);
          break;
        }

        logger.log(`🔄 Clicking next page`);
        
        await nextBtn.first().scrollIntoViewIfNeeded();
        await nextBtn.first().click();

        // Wait longer after clicking
        await randomWait(3000, 4000);
        
        await page.waitForSelector('table.licensee-table tbody tr', { timeout: 20000 });
        await randomWait(1000, 1500);

        logger.log(`✅ Navigated to page ${pageNumber + 1}`);
        pageNumber++;
      }

    } catch (err) {
      logger.log(`❌ Fatal error: ${err.message}`);
    }

    await client.closeBrowser();
    logger.log("\n🏁 Scraping completed successfully");
    logger.log(`📊 Total unique records: ${seen.size}`);
    
    // Clear progress file on successful completion
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
      logger.log(`🗑️ Progress file cleared`);
    }
  },
};