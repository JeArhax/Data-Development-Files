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
    
    // CRITICAL: Wait for table to be fully populated
    // Salesforce Lightning loads the table structure first, then populates rows
    await randomWait(2000, 3000);
    
    // Wait for table cells to have content
    await page.waitForFunction(
      () => {
        const rows = document.querySelectorAll('table.licensee-table tbody tr');
        if (rows.length === 0) return false;
        
        // Check if first few rows have name cells with content
        for (let i = 0; i < Math.min(3, rows.length); i++) {
          const nameCell = rows[i].querySelector('td:nth-child(2)');
          if (!nameCell || !nameCell.innerText.trim()) return false;
        }
        return true;
      },
      { timeout: 8000 }
    ).catch(() => {
      logger.log(`⚠️ Table content verification timed out, proceeding anyway`);
    });
    
    await randomWait(1000, 1500);

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
        
        // Wait for any loading spinners to disappear
        const spinner = page.locator('lightning-spinner');
        if (await spinner.count() > 0) {
          logger.log(`⏳ Waiting for loading spinner to disappear...`);
          await spinner.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
            logger.log(`⚠️ Spinner still visible, proceeding anyway`);
          });
          await randomWait(500, 1000);
        }
        
        await viewBtn.first().click();

        // wait for profile card
        await page.waitForSelector('article.slds-card', { timeout: 15000 });
        await randomWait(800, 1200);

        const profileCard = page
          .locator('article.slds-card')
          .filter({ hasText: 'Licensee Name' })
          .first();

        // Extract fields
        const licenseeName = await getProfileValue(profileCard, "Licensee Name");
        const professionName = await getProfileValue(profileCard, "Profession Name");
        const licenseNumber = await getProfileValue(profileCard, "License Number");
        const expirationDate = await getProfileValue(profileCard, "Expiration Date");
        const originalIssueDate = await getProfileValue(profileCard, "Original Issue Date");
        const currentDisciplineStatus = await getProfileValue(profileCard, "Current Discipline Status");
        const previousDisciplinaryActions = await getProfileValue(profileCard, "Previous Disciplinary Actions");
        const cityDetail = await getProfileValue(profileCard, "City");
        const stateDetail = await getProfileValue(profileCard, "State");
        const postalCode = await getProfileValue(profileCard, "Postal Code");
        const county = await getProfileValue(profileCard, "County");

        results.push({
          licenseeName,
          professionName,
          licenseNumber,
          expirationDate,
          originalIssueDate,
          currentDisciplineStatus,
          previousDisciplinaryActions,
          cityDetail,
          stateDetail,
          postalCode,
          county,
          scrapedAt: new Date().toISOString()
        });

        logger.log(`✅ Successfully scraped profile: ${licenseeName}`);

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
              { timeout: 20000 }
            );
            
            await randomWait(1000, 1500);
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