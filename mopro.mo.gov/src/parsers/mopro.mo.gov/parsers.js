const { wait, randomWait } = require('../../utils/async');
const { safe } = require('../../utils/errors');
const logger = require('../../utils/loggers');
const config = require('../../config');

/**
 * Safely get a field from a profile card (LWC slot-compatible)
 */
async function getProfileValue(card, label) {
  return await safe(async () => {
    const locator = card.locator(
      `.label:has-text("${label}") >> xpath=following-sibling::div[1]`
    );

    if (await locator.count() === 0) return '';
    return (await locator.first().innerText()).trim();
  }, '');
}


module.exports = {
  selectProfessions: async (page) => {
    const container = page.locator('.slds-dueling-list__options');
    for (const prof of config.professions) {
      const option = container.locator(`div[role="option"] span[title="${prof}"]`);
      await option.first().click();
      await randomWait();
      const moveBtn = page.locator('lightning-button-icon button[title="Move to Selected"]').first();
      await moveBtn.click();
      await randomWait(400, 700);
    }
    logger.log('Professions selected');
  },

  selectSearchByName: async (page) => {
    await page.locator('label', { hasText: 'Licensee Name (Partial - enter in the textbox below)' }).click();
    await randomWait();
  },

  /**
   * Parse results table and scrape all licensee profiles
   */
  parseResultsTable: async (page, searchName) => {
    await page.waitForSelector('table.licensee-table tbody tr, div.no-results-message', { timeout: 20000 });
    
    // Quick wait for table
    await randomWait(800, 1200);

    let rows = page.locator('table.licensee-table tbody tr');
    const rowCount = await rows.count();

    logger.log(`📋 Table has ${rowCount} rows to process`);

    if (rowCount === 0) {
      logger.log(`No results for ${searchName}`);
      return [];
    }

    const results = [];

    for (let i = 0; i < rowCount; i++) {
      rows = page.locator('table.licensee-table tbody tr');
      const row = rows.nth(i);

      // Don't extract from table - it may be stale
      // We'll get all data from the profile card
      
      try {
        // Simple approach: The Action column is the 6th column (index 5)
        // Get the button directly from that cell
        const actionCell = row.locator('td').nth(5);
        const viewBtn = actionCell.locator('button');
        
        const btnCount = await viewBtn.count();
        
        if (btnCount === 0) {
          logger.log(`⚠️ No button in action cell for row ${i + 1}, skipping`);
          continue;
        }
        
        logger.log(`✅ Found view button for row ${i + 1}, clicking...`);
        
        // Wait for spinner with timeout, then force click if needed
        const spinner = page.locator('lightning-spinner');
        if (await spinner.count() > 0) {
          await spinner.first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {
            logger.log(`⚠️ Spinner stuck for row ${i + 1}, will force click`);
          });
          await randomWait(300, 500);
        }
        
        // Try normal click first, force if it fails
        try {
          await viewBtn.first().click({ timeout: 5000 });
        } catch (err) {
          logger.log(`⚠️ Normal click failed, force clicking row ${i + 1}`);
          await viewBtn.first().click({ force: true, timeout: 5000 });
        }

        // wait for profile card
        await page.waitForSelector('article.slds-card', { timeout: 10000 });
        await randomWait(400, 600);

        const profileCard = page
          .locator('article.slds-card')
          .filter({ hasText: 'Licensee Name' })
          .first();

        // Extract fields following documentation standards
        const fullName = await getProfileValue(profileCard, "Licensee Name");
        const professionName = await getProfileValue(profileCard, "Profession Name");
        const licenseNumber = await getProfileValue(profileCard, "License Number");
        const expirationDate = await getProfileValue(profileCard, "Expiration Date");
        const originalIssueDate = await getProfileValue(profileCard, "Original Issue Date");
        const currentDisciplineStatus = await getProfileValue(profileCard, "Current Discipline Status");
        const previousDisciplinaryActions = await getProfileValue(profileCard, "Previous Disciplinary Actions");
        const city = await getProfileValue(profileCard, "City");
        const state = await getProfileValue(profileCard, "State");
        const postalCode = await getProfileValue(profileCard, "Postal Code");
        const county = await getProfileValue(profileCard, "County");

        results.push({
          // Standard fields
          fullName,
          licenseNumber,
          
          // Professional info
          professionName,
          expirationDate,
          originalIssueDate,
          currentDisciplineStatus,
          previousDisciplinaryActions,
          
          // Location info (using profile prefix as per docs)
          profileLocation: `${city}, ${state}`,
          city,
          state,
          postalCode,
          county,
          
          // Metadata (required by docs)
          sourceUrl: "mopro.mo.gov",
          currentPageUrl: page.url(),
          scrapedAt: new Date().toISOString()
        });

        logger.log(`✅ Successfully scraped profile: ${fullName}`);

      } catch (err) {
        logger.log(`❌ Failed to scrape row ${i + 1}: ${err.message}`);

      } finally {
        try {
          const backBtn = page.locator(
            'button[title="Back to Licensee Search Page"]'
          );

          if (await backBtn.count() > 0) {
            await backBtn.scrollIntoViewIfNeeded();
            await backBtn.click();
            
            await page.waitForSelector(
              'table.licensee-table tbody tr',
              { timeout: 15000 }
            );
            
            await randomWait(600, 900);
          }
        } catch (backErr) {
          logger.log(`⚠️ Error clicking back for row ${i + 1}: ${backErr.message}`);
          await randomWait(2000, 3000);
        }
      }
    }

    return results;
  }
};