const puppeteer = require("puppeteer");

let browser = null;
let page = null;

module.exports = {
  initBrowser: async () => {
    browser = await puppeteer.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    return page;
  },

  getPage: () => {
    if (!page) {
      throw new Error("Browser not initialized. Call initBrowser() first.");
    }
    return page;
  },

  closeBrowser: async () => {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
    }
  },
};
