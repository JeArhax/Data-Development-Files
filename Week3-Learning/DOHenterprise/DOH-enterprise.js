const puppeteer = require("puppeteer");
const fs = require("fs");

// --- Helpers ---
function generateLastNameSeeds() {
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  const combos = [...letters];
  for (let a of letters) {
    for (let b of letters) combos.push(a + b);
  }
  return combos;
}

const jsonlStream = fs.createWriteStream("DOH-Vet.jsonl", { flags: "a" });
const csvStream = fs.createWriteStream("DOH-Vet.csv", { flags: "a" });

function writeJSONL(obj) {
  jsonlStream.write(JSON.stringify(obj) + "\n");
}

let headerWritten = false;
function writeCSV(obj) {
  if (!headerWritten) {
    csvStream.write(Object.keys(obj).join(",") + "\n");
    headerWritten = true;
  }
  csvStream.write(
    Object.values(obj).map((v) => JSON.stringify(v ?? "")).join(",") + "\n"
  );
}

// --- Delay helper ---
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main ---
(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const BASE_URL = "https://dohenterprise.my.site.com/ver/s/";
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  const seeds = generateLastNameSeeds();
  console.log("Total seeds:", seeds.length);

  const seen = new Set(); // to avoid duplicates

  for (const seed of seeds) {
    console.log("Searching seed:", seed);

    // --- Fill form ---
    await page.waitForSelector("#Proffession");
    await page.select("#Proffession", "VETERINARY EXAMINERS");

    await page.waitForSelector("#LicenseType");
    await page.select("#LicenseType", "VETERINARIAN");

    await page.waitForSelector("#Status");
    await page.select("#Status", "Active");

    await page.waitForSelector("#LastName");
    await page.evaluate(() => { document.querySelector("#LastName").value = ""; });
    await page.type("#LastName", seed, { delay: 20 });

    // --- Click Search ---
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("a.slds-button.slds-button_brand")]
        .find(b => b.innerText.includes("Search"));
      if (btn) btn.click();
    });

    // --- Wait for results table ---
    let records = [];
    try {
      await page.waitForSelector("table.slds-table.slds-table--bordered tr", { timeout: 10000 });

      records = await page.$$eval(
        "table.slds-table.slds-table--bordered tr",
        trs => trs
          .filter(tr => tr.querySelector("td")) // skip header
          .map(tr => {
            const tds = tr.querySelectorAll("td");
            return {
              fullName: tds[0]?.innerText.trim(),
              licenseNumber: tds[1]?.innerText.trim(),
              licenseType: tds[2]?.innerText.trim(),
              status: tds[3]?.innerText.trim(),
              issueDate: tds[4]?.innerText.trim(),
              expirationDate: tds[5]?.innerText.trim(),
              tempLicenseIssueDate: tds[7]?.innerText.trim() || "",
            };
          })
      );

      // --- Write unique records ---
      let count = 0;
      for (const rec of records) {
        const key = rec.licenseNumber;
        if (!seen.has(key)) {
          seen.add(key);
          writeJSONL(rec);
          writeCSV(rec);
          count++;
        }
      }
      console.log(`Found ${count} new records for seed ${seed}`);
    } catch {
      console.log(`No results for seed ${seed}`);
    }

    // --- Click "Search Again" ---
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("a.slds-button.slds-button_brand")]
    .find(b => b.innerText.includes("Search Again"));
  if (btn) btn.click();
});

// --- Wait until #LastName input exists and is visible ---
await page.waitForFunction(
  () => {
    const el = document.querySelector("#LastName");
    return el && el.offsetParent !== null; // visible check
  },
  { timeout: 30000 }
);

await delay(500); // small pause before next seed

  }

  await browser.close();
  console.log("Scraping completed.");
})();
