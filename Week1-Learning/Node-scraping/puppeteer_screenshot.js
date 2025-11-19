import puppeteer from "puppeteer";

// Define a function to scrape quotes from a website
const scrapeData = async () => {

    // Launch a new browser instance
    const browser = await puppeteer.launch({
        headless: false, // Set to true to run in headless mode
        defaultViewport: null,
    });

    // Open a new page in the browser
    const page = await browser.newPage();

    // Navigate to the URL of the website you want to scrape
    await page.goto("https://www.riotgames.com/en");

    // Take a screenshot of the webpage
    await page.screenshot({ path: 'screenshot.png' });

    // Close the browser instance
    await browser.close();
   
};

// Call the scrapeData function to initiate the scraping process
scrapeData();