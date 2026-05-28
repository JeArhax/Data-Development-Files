const config = require('../../../config');
const { wait } = require('../../utils/async');
const logger = require('../../utils/loggers');

// Wait for visible element
async function waitForVisible(page, selector, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = await page.$(selector);
    if (el) {
      const visible = await page.evaluate(e => e.offsetParent !== null, el);
      if (visible) return el;
    }
    await wait(200);
  }
  throw new Error(`Element ${selector} not visible after ${timeout}ms`);
}

module.exports = {
  /**
   * Check and select board checkbox (one time setup)
   */
  setupBoardCheckbox: async (page) => {
    try {
      const board = await waitForVisible(page, config.selectors.boardCheckbox);
      const isChecked = await page.evaluate(el => el.checked, board);
      if (!isChecked) {
        await board.click();
        await wait(config.delays.afterCheck);
        logger.log('Board checkbox checked');
      }
    } catch (err) {
      logger.error(`Error setting up board checkbox: ${err.message}`);
      throw err;
    }
  },

  /**
   * Select status
   */
  selectStatus: async (page, status) => {
    try {
      const statusSelect = await waitForVisible(page, config.selectors.status);
      await page.select(config.selectors.status, status);
      await wait(config.delays.afterStatusSelect);
      logger.log(`Selected status: ${status || 'All'}`);
    } catch (err) {
      logger.error(`Error selecting status: ${err.message}`);
      throw err;
    }
  },

  /**
   * Fill and search by last name
   */
  searchByLastName: async (page, lastName) => {
    try {
      const lastNameInput = await waitForVisible(page, config.selectors.lastNameInput);
      await lastNameInput.evaluate(el => el.value = "");
      await lastNameInput.type(lastName, { delay: 100 });
      await wait(config.delays.afterTyping);

      const searchBtn = await waitForVisible(page, config.selectors.searchButton);
      await searchBtn.click();
      await wait(config.delays.afterSearch);

      // Scroll to bottom for full render
      await page.evaluate(() => {
        const btn = document.getElementById('ContentPlaceHolder2_ui_btnPageBottom');
        if (btn) btn.scrollIntoView({ behavior: 'smooth' });
      });
      await wait(config.delays.afterScroll);

      logger.log(`Searched for: ${lastName}`);
    } catch (err) {
      logger.error(`Error searching: ${err.message}`);
      throw err;
    }
  },

  /**
   * Parse results table
   */
  parseResults: async (page) => {
    try {
      const dataContainer = await page.$(config.selectors.dataContainer);
      if (!dataContainer) {
        logger.warn('No data container found');
        return [];
      }

      // Check for "No Matches Found"
      const text = await page.evaluate(el => el.innerText.trim(), dataContainer);
      if (text === 'No Matches Found.') {
        logger.log('No matches found');
        return [];
      }

      // Parse table(s)
      const tables = await dataContainer.$$(config.selectors.resultsTable);
      let records = [];

      for (const table of tables) {
        const isRealTable = await table.$$eval("tr.trstyle3 td", tds =>
          tds.some(td => td.innerText.trim().toLowerCase() === "license number")
        );
        if (!isRealTable) continue;

        const rows = await table.$$eval("tr", (trs, currentUrl) =>
          trs
            .filter(tr => !tr.classList.contains("trstyle3"))
            .map(tr => {
              const tds = tr.querySelectorAll("td");
              if (!tds[4] || !tds[4].innerText.trim()) return null;
              return {
                fullName: tds[0]?.innerText.trim() || "",
                boardName: tds[1]?.innerText.trim() || "",
                licenseType: tds[2]?.innerText.trim() || "",
                legacyNumber: tds[3]?.innerText.trim() || "",
                licenseNumber: tds[4]?.innerText.trim() || "",
                disciplinaryActions: tds[5]?.innerText.trim() || "",
                status: tds[6]?.innerText.trim() || "",
                issueDate: tds[7]?.innerText.trim() || "",
                expirationDate: tds[8]?.innerText.trim() || "",
                sourceUrl: "oop.ky.gov",
                currentPageUrl: currentUrl,
                scrapedAt: new Date().toISOString(),
              };
            })
            .filter(Boolean),
          page.url()
        );

        if (rows.length > 0) {
          records = rows;
          break;
        }
      }

      logger.log(`Parsed ${records.length} records`);
      return records;
    } catch (err) {
      logger.error(`Error parsing results: ${err.message}`);
      return [];
    }
  },
};
