const processor = require('./src/processors/urlProcessors_oop.ky.gov');
const logger = require('./src/utils/loggers');

(async () => {
  try {
    logger.log('Starting Kentucky OOP scraper...');
    await processor.processKentucky();
    logger.success('Scraping completed successfully!');
  } catch (err) {
    logger.error(`Fatal error: ${err.message}`);
    process.exit(1);
  }
})();
