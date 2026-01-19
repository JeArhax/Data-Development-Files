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
    await parsers.selectSearchByName(page);

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
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
    let progress = { lastSearch: null, lastPage: 1, totalRecords: 0, seenLicenses: [] };
    if (fs.existsSync(progressFile)) {
      try {
        progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        
        // Ensure all fields exist with defaults
        progress.lastSearch = progress.lastSearch || null;
        progress.lastPage = progress.lastPage || 1;
        progress.totalRecords = progress.totalRecords || 0;
        progress.seenLicenses = progress.seenLicenses || [];
        
        logger.log(`📂 Resuming from last search: ${progress.lastSearch || 'start'} (Page ${progress.lastPage})`);
        logger.log(`📊 Previously extracted: ${progress.totalRecords} records`);
        logger.log(`📋 Loading ${progress.seenLicenses.length} previously seen license numbers`);
        
        // Restore seen Set
        progress.seenLicenses.forEach(license => seen.add(license));
      } catch (err) {
        logger.log(`⚠️ Progress file corrupted, starting fresh: ${err.message}`);
        // Backup corrupted file
        fs.renameSync(progressFile, progressFile + '.corrupted');
        progress = { lastSearch: null, lastPage: 1, totalRecords: 0, seenLicenses: [] };
      }
    }

    let shouldResume = progress.lastSearch !== null;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    for (const first of letters) {
      for (const second of letters) {
        const searchName = first + second;
        
        // Skip until we reach the last processed search
        if (shouldResume) {
          if (searchName === progress.lastSearch) {
            shouldResume = false;
            logger.log(`✅ Reached last checkpoint: ${searchName}`);
            logger.log(`📄 Resuming from page ${progress.lastPage}`);
            // Don't skip this search, but we'll skip pages below
          } else {
            continue; // Skip searches before the checkpoint
          }
        }

        logger.log(`🔍 Searching ${searchName}`);

        // Check if we should stop due to errors
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.log(`\n🛑 STOPPING: ${MAX_CONSECUTIVE_ERRORS} consecutive errors detected`);
          logger.log(`📊 Last successful search: ${progress.lastSearch}`);
          logger.log(`📊 Total records extracted: ${progress.totalRecords}`);
          logger.log(`💾 Progress saved. Run again to resume from ${progress.lastSearch}`);
          await client.closeBrowser();
          return;
        }

        try {
          // ===== SUBMIT SEARCH =====
          const input = page.locator('input[type="text"]');
          await input.fill(searchName);
          await randomWait(300, 600);

          await page
            .locator('button.slds-button_brand', { hasText: "Submit" })
            .click();

          await page.waitForSelector("table.licensee-table tbody tr");
          await randomWait(800, 1200);

          let pageNumber = 1;
          let isResuming = (searchName === progress.lastSearch && progress.lastPage > 1);

          // If resuming, navigate to the last processed page
          if (isResuming) {
            logger.log(`⏭️ Skipping to page ${progress.lastPage}...`);
            
            for (let skipPage = 1; skipPage < progress.lastPage; skipPage++) {
              const nextBtn = page.locator('lightning-button-icon.nextButtonClass button[title="next"]');
              
              if (await nextBtn.count() === 0 || await nextBtn.first().isDisabled().catch(() => true)) {
                logger.log(`⚠️ Could not navigate to page ${progress.lastPage}, starting from page ${skipPage}`);
                pageNumber = skipPage;
                break;
              }
              
              await nextBtn.first().click();
              await randomWait(2000, 2500);
              await page.waitForSelector('table.licensee-table tbody tr', { timeout: 20000 });
              await randomWait(500, 800);
            }
            
            pageNumber = progress.lastPage;
            logger.log(`✅ Resumed at page ${pageNumber}`);
          }

          // ===== PAGINATION LOOP =====
          while (true) {
            logger.log(`📄 Processing ${searchName} Page ${pageNumber}`);
            
            const results = await parsers.parseResultsTable(page, searchName);

            logger.log(`📥 Extracted ${results.length} profiles from page`);
            
            let duplicateCount = 0;
            let noLicenseCount = 0;
            
            const cleanResults = results.filter(r => {
              if (!r.licenseNumber) {
                noLicenseCount++;
                return false;
              }
              if (seen.has(r.licenseNumber)) {
                duplicateCount++;
                return false;
              }
              seen.add(r.licenseNumber);
              return true;
            });

            if (duplicateCount > 0 || noLicenseCount > 0) {
              logger.log(`📊 ${cleanResults.length} new, ${duplicateCount} duplicates, ${noLicenseCount} no license`);
            }

            if (cleanResults.length) {
              logger.log(`✅ ${searchName} Page ${pageNumber}: ${cleanResults.length} records`);

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
              
              // Reset error counter on success
              consecutiveErrors = 0;
              
              // Save progress after each page
              progress.lastSearch = searchName;
              progress.lastPage = pageNumber;
              progress.seenLicenses = Array.from(seen);
              fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
              logger.log(`💾 Progress saved: ${searchName} page ${pageNumber}, total: ${progress.totalRecords} records`);
            }

            // ====== SALESFORCE LWC PAGINATION ======
            await randomWait(1000, 1500);
            
            const nextBtn = page.locator(
              'lightning-button-icon.nextButtonClass button[title="next"]'
            );

            if (await nextBtn.count() === 0) {
              logger.log(`⛔ Next button not found for ${searchName}`);
              break;
            }

            const isDisabled = await nextBtn.first().isDisabled().catch(() => true);
            if (isDisabled) {
              logger.log(`⛔ Next button disabled for ${searchName}`);
              break;
            }

            logger.log(`🔄 Clicking next page for ${searchName}`);
            
            await nextBtn.first().scrollIntoViewIfNeeded();
            await nextBtn.first().click();

            // Quick wait for page to load
            await randomWait(1000, 1500);
            
            // Wait for table
            await page.waitForSelector('table.licensee-table tbody tr', { timeout: 10000 });

            logger.log(`✅ Navigated to page ${pageNumber + 1}`);
            pageNumber++;
            await randomWait(500, 800);
          }

        } catch (err) {
          consecutiveErrors++;
          logger.log(`❌ Failed for ${searchName}: ${err.message}`);
          logger.log(`⚠️ Consecutive errors: ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}`);
          
          // Save progress even on error
          progress.seenLicenses = Array.from(seen);
          fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
        }

        await randomWait(600, 1000);
      }
    }

    await client.closeBrowser();
    logger.log("🏁 Scraping completed successfully");
    logger.log(`📊 Total unique records: ${seen.size}`);
    
    // Clear progress file on successful completion
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
    }
  },
};