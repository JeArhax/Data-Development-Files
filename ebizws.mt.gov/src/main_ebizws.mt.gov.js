const { createBrowser, openSearchPage } = require("./services/healthri.mylicense.com/client");
const { processHealthRI } = require("./processors/urlProcessors_healthri.mylicense.com");
const config = require("./config");

(async () => {
  const browser = await createBrowser();
  const page = await openSearchPage(browser, config.startUrl);

  await processHealthRI(page, browser);

  await browser.close();
})();
