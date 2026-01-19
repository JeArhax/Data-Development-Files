const puppeteer = require("puppeteer");

async function createBrowser() {
  return puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
}

async function openSearchPage(browser, url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  return page;
}

async function clickAndWait(page, selector) {
  await Promise.all([
    page.click(selector),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);
}

module.exports = {
  createBrowser,
  openSearchPage,
  clickAndWait,
};
