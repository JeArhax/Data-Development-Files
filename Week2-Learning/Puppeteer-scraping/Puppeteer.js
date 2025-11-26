import puppeteer from "puppeteer";

// Helper function for random delay in milliseconds
const randomDelay = (min = 1000, max = 3000) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Helper function to pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// List of sample user-agents
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
];

const scrapeData = async () => {
    const browser = await puppeteer.launch({
        headless: false,  // Observe browser behavior
        defaultViewport: null
    });

    const page = await browser.newPage();

    // Set a random user-agent
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUA);

    // Random delay before navigation
    await sleep(randomDelay());

    await page.goto("https://www.riotgames.com/en");

    // Random delay before taking screenshot
    await sleep(randomDelay());

    await page.screenshot({ path: "screenshot.png" });

    await browser.close();
};

scrapeData();
