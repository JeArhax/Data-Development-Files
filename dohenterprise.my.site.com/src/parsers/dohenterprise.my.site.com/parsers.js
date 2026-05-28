const config = require('../../../config');
const { wait } = require('../../utils/async');
const logger = require('../../utils/loggers');

module.exports = {
  /**
   * Fill search form with given parameters
   */
  fillSearchForm: async (page, { profession, licenseType, status, lastName }) => {
    try {
      await page.waitForSelector(config.selectors.profession, { timeout: 10000 });
      await page.select(config.selectors.profession, profession);

      await page.waitForSelector(config.selectors.licenseType);
      await page.select(config.selectors.licenseType, licenseType);

      await page.waitForSelector(config.selectors.status);
      await page.select(config.selectors.status, status);

      await page.waitForSelector(config.selectors.lastName);
      await page.evaluate(() => { 
        document.querySelector("#LastName").value = ""; 
      });
      await page.type(config.selectors.lastName, lastName, { delay: config.delays.typing });

      logger.log(`Filled search form: ${status} - ${lastName}`);
    } catch (err) {
      logger.error(`Error filling search form: ${err.message}`);
      throw err;
    }
  },

  /**
   * Click search button
   */
  clickSearch: async (page) => {
    try {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("a.slds-button.slds-button_brand")]
          .find(b => b.innerText.includes("Search"));
        if (btn) btn.click();
      });
      
      await wait(config.delays.afterSearch);
      logger.log('Clicked search button');
    } catch (err) {
      logger.error(`Error clicking search: ${err.message}`);
      throw err;
    }
  },

  /**
   * Parse results table
   */
  parseResultsTable: async (page) => {
    try {
      await page.waitForSelector(config.selectors.resultsTable, { timeout: 10000 });

      const records = await page.$$eval(
        config.selectors.resultsTable,
        (trs, currentUrl) => trs
          .filter(tr => tr.querySelector("td"))
          .map(tr => {
            const tds = tr.querySelectorAll("td");
            return {
              fullName: tds[0]?.innerText.trim() || "",
              licenseNumber: tds[1]?.innerText.trim() || "",
              licenseType: tds[2]?.innerText.trim() || "",
              status: tds[3]?.innerText.trim() || "",
              issueDate: tds[4]?.innerText.trim() || "",
              expirationDate: tds[5]?.innerText.trim() || "",
              tempLicenseIssueDate: tds[7]?.innerText.trim() || "",
              sourceUrl: "dohenterprise.my.site.com",
              currentPageUrl: currentUrl,
              scrapedAt: new Date().toISOString(),
            };
          }),
        page.url()
      );

      logger.log(`Parsed ${records.length} records from results table`);
      return records;
    } catch (err) {
      logger.warn(`No results found or error parsing: ${err.message}`);
      return [];
    }
  },

  /**
   * Click "Search Again" button
   */
  clickSearchAgain: async (page) => {
    try {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("a.slds-button.slds-button_brand")]
          .find(b => b.innerText.includes("Search Again"));
        if (btn) btn.click();
      });

      await page.waitForFunction(
        () => {
          const el = document.querySelector("#LastName");
          return el && el.offsetParent !== null;
        },
        { timeout: 30000 }
      );

      await wait(config.delays.betweenSearches);
      logger.log('Clicked search again');
    } catch (err) {
      logger.error(`Error clicking search again: ${err.message}`);
      throw err;
    }
  },
};
