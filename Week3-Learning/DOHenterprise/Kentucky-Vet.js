const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const LAST_SEED_FILE = path.join(__dirname, "last_seed.txt");

// --- Helpers ---
function generateLastNameSeeds() {
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  const combos = [...letters];
  for (let a of letters) {
    for (let b of letters) combos.push(a + b);
  }
  return combos;
}

// --- Output streams ---
const jsonlStream = fs.createWriteStream("kentucky-Vet.jsonl", { flags: "a" });
const csvStream = fs.createWriteStream("Kentucky-Vet.csv", { flags: "a" });

function writeJSONL(obj) {
  jsonlStream.write(JSON.stringify(obj) + "\n");
}

let headerWritten = false;
function writeCSV(obj) {
  if (!headerWritten) {
    csvStream.write(Object.keys(obj).join(",") + "\n");
    headerWritten = true;
  }
  csvStream.write(Object.values(obj).map(v => JSON.stringify(v ?? "")).join(",") + "\n");
}

// --- Delay helper ---
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Wait for visible element ---
async function waitForVisible(page, selector, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = await page.$(selector);
    if (el) {
      const visible = await page.evaluate(e => e.offsetParent !== null, el);
      if (visible) return el;
    }
    await delay(200);
  }
  throw new Error(`Element ${selector} not visible after ${timeout}ms`);
}

// --- Read last processed seed ---
function getLastSeed() {
  if (fs.existsSync(LAST_SEED_FILE)) {
    return fs.readFileSync(LAST_SEED_FILE, "utf-8").trim();
  }
  return null;
}

// --- Save last processed seed ---
function saveLastSeed(seed) {
  fs.writeFileSync(LAST_SEED_FILE, seed, "utf-8");
}

// --- Main ---
(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const BASE_URL = "https://oop.ky.gov/lic_search.aspx";

  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  const seeds = generateLastNameSeeds();
  const lastSeed = getLastSeed();

  let startIndex = 0;
  if (lastSeed) {
    const idx = seeds.indexOf(lastSeed);
    if (idx >= 0 && idx + 1 < seeds.length) startIndex = idx + 1;
    console.log(`Resuming from seed ${seeds[startIndex]} (after last seed ${lastSeed})`);
  }

  console.log("Total seeds to process:", seeds.length - startIndex);
  const seen = new Set();

  // --- Ensure board checkbox checked once ---
  const board = await waitForVisible(page, "#ContentPlaceHolder2_chkBoards_24");
  const isChecked = await page.evaluate(el => el.checked, board);
  if (!isChecked) {
    await board.click();
    await delay(1500);
  }

  // --- Select Active status once ---
  const status = await waitForVisible(page, "#ContentPlaceHolder2_DStatus");
  await page.select("#ContentPlaceHolder2_DStatus", "Active");
  await delay(1000);

  for (let i = startIndex; i < seeds.length; i++) {
    const seed = seeds[i];
    console.log(`\nSearching seed: ${seed}`);

    try {
      // --- Type last name ---
      const lastNameInput = await waitForVisible(page, "#ContentPlaceHolder2_TLname");
      await lastNameInput.evaluate(el => el.value = "");
      await lastNameInput.type(seed, { delay: 100 });
      await delay(800);

      // --- Click search ---
      const searchBtn = await waitForVisible(page, "#ContentPlaceHolder2_BSrch");
      await searchBtn.click();
      await delay(3000);

      // --- Scroll to bottom for full render ---
      await page.evaluate(() => {
        const btn = document.getElementById('ContentPlaceHolder2_ui_btnPageBottom');
        if (btn) btn.scrollIntoView({ behavior: 'smooth' });
      });
      await delay(1000);

      // --- Check for "No Matches Found" ---
      const dataContainer = await page.$('#ContentPlaceHolder2_LData');
      let records = [];

      if (dataContainer) {
        const text = await page.evaluate(el => el.innerText.trim(), dataContainer);
        if (text === 'No Matches Found.') {
          console.log(`No records found for seed ${seed}, skipping...`);
          saveLastSeed(seed);
          continue; // skip to next seed
        }

        // --- Parse table(s) ---
        const tables = await dataContainer.$$('.tablestyle13');
        for (const table of tables) {
          const isRealTable = await table.$$eval("tr.trstyle3 td", tds =>
            tds.some(td => td.innerText.trim().toLowerCase() === "license number")
          );
          if (!isRealTable) continue;

          const rows = await table.$$eval("tr", trs =>
            trs
              .filter(tr => !tr.classList.contains("trstyle3"))
              .map(tr => {
                const tds = tr.querySelectorAll("td");
                if (!tds[4] || !tds[4].innerText.trim()) return null;
                return {
                  fullName: tds[0]?.innerText.trim() || "",
                  boardName: tds[1]?.innerText.trim() || "",
                  licenseType: tds[2]?.innerText.trim() || "",
                  legacyNumber: tds[3]?.innerText.trim() || "",
                  licenseNumber: tds[4]?.innerText.trim() || "",
                  disciplinaryActions: tds[5]?.innerText.trim() || "",
                  status: tds[6]?.innerText.trim() || "",
                  issueDate: tds[7]?.innerText.trim() || "",
                  expirationDate: tds[8]?.innerText.trim() || ""
                };
              })
              .filter(Boolean)
          );

          if (rows.length > 0) {
            records = rows;
            break;
          }
        }
      }

      // --- Skip if no records ---
      if (records.length === 0) {
        console.log(`No records found for seed ${seed}, skipping...`);
        saveLastSeed(seed);
        await delay(1000);
        continue;
      }

      // --- Write unique records ---
      let countNew = 0;
      let countDup = 0;
      for (const rec of records) {
        if (!rec.licenseNumber) continue;
        if (!seen.has(rec.licenseNumber)) {
          seen.add(rec.licenseNumber);
          writeJSONL(rec);
          writeCSV(rec);
          countNew++;
        } else {
          countDup++;
        }
      }

      console.log(`Found ${countNew} new records for seed ${seed}`);
      if (countDup > 0) console.log(`Skipped ${countDup} duplicate records for seed ${seed}`);

      saveLastSeed(seed);
      await delay(1200);

    } catch (err) {
      console.log(`Error for seed ${seed}:`, err.message);
      saveLastSeed(seed);
      await delay(1500);
    }
  }

  await browser.close();
  console.log("\nScraping completed.");
})();
