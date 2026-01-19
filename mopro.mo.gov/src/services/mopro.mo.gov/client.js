const { chromium } = require('playwright');
const config = require('../../config');

let browser, context, page;

module.exports = {
  initBrowser: async () => {
    browser = await chromium.launch({ headless: config.headless });
    context = await browser.newContext();
    page = await context.newPage();
    return page;
  },

  closeBrowser: async () => {
    await browser.close();
  },

  getPage: () => page
};
