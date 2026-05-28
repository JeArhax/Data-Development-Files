const processor = require('./src/processors/urlProcessors_dohenterprise.my.site.com');
const logger = require('./src/utils/loggers');

(async () => {
  try {
    logger.log('Starting DOH Vermont scraper...');
    await processor.processDOH();
    logger.success('Scraping completed successfully!');
  } catch (err) {
    logger.error(`Fatal error: ${err.message}`);
    process.exit(1);
  }
})();
