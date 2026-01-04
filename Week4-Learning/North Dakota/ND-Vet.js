const puppeteer = require("puppeteer");
const fs = require("fs");

const BASE_URL = "https://services.ndbvme.org/verify/";
const JSONL_FILE = "ndbvme.jsonl";
const CSV_FILE = "ndbvme.csv";
const STATE_FILE = "ndbvme_state.json";

// ---------------- CONFIG ----------------
const LICENSE_TYPES = [
  { value: "VET", label: "Veterinarian" },
  { value: "TECH", label: "Veterinary Technician" }
];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ---------------- STATE ----------------
let state = { type: null, letter: null, lastLicense: null };
if (fs.existsSync(STATE_FILE)) {
  state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(type, letter, lastLicense) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ type, letter, lastLicense }, null, 2)
  );
}

// ---------------- DUPLICATES ----------------
const seen = new Set();
if (fs.existsSync(JSONL_FILE)) {
  for (const line of fs.readFileSync(JSONL_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.licenseNumber) seen.add(obj.licenseNumber);
    } catch {}
  }
}
console.log(` Loaded ${seen.size} existing licenses`);

// ---------------- OUTPUT ----------------
const jsonl = fs.createWriteStream(JSONL_FILE, { flags: "a" });
const csv = fs.createWriteStream(CSV_FILE, { flags: "a" });
let csvHeaderWritten = fs.existsSync(CSV_FILE);

function saveRecord(rec) {
  jsonl.write(JSON.stringify(rec) + "\n");
  if (!csvHeaderWritten) {
    csv.write(Object.keys(rec).join(",") + "\n");
    csvHeaderWritten = true;
  }
  csv.write(
    Object.values(rec).map(v => JSON.stringify(v || "")).join(",") + "\n"
  );
}

// ---------------- HELPERS ----------------
const delay = ms => new Promise(r => setTimeout(r, ms));

// ---------------- MAIN ----------------
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  async function search(letter, type) {
    await page.select("#inputType", type);
    await page.$eval("#inputLastName", el => (el.value = ""));
    await page.type("#inputLastName", letter, { delay: 80 });

    await Promise.all([
      page.click("button[name='search']"),
      page.waitForSelector("table.table tbody tr", { timeout: 15000 })
    ]);
  }

  async function scrapeDetails() {
    return await page.evaluate(() => {
      const pick = label => {
        const rows = [...document.querySelectorAll("tr")];
        const row = rows.find(r => r.innerText.includes(label));
        return row
          ? row.querySelector("td:last-child")?.innerText.trim()
          : "";
      };

      return {
        licenseNumber: pick("License Number"),
        name: pick("Name"),
        licenseType: pick("License Type"),
        issuedDate: pick("Date Issued"),
        expirationDate: pick("Expiration Date"),
        discipline: pick("Discipline"),
        primaryAddress: pick("Primary Business Address")
      };
    });
  }

  // ---------------- SCRAPE ROWS ----------------
  async function scrapeCurrentPage(type, letter) {
    let rows = await page.$$eval(
      "table.table tbody tr",
      r => r.length
    );

    for (let i = 0; i < rows; i++) {
      const license = await page.$eval(
        `table.table tbody tr:nth-child(${i + 1}) td:first-child`,
        el => el.innerText.trim()
      );

      if (seen.has(license)) continue;
      if (state.lastLicense && license <= state.lastLicense) continue;

      // 1️⃣ Open detail page
      await Promise.all([
        page.click(
          `table.table tbody tr:nth-child(${i + 1}) td:nth-child(2) a`
        ),
        page.waitForSelector("#printcontent", { timeout: 15000 })
      ]);

      // 2️⃣ Extract and save
      const data = await scrapeDetails();
      data.searchLetter = letter;
      data.licenseCategory = type;

      seen.add(data.licenseNumber);
      saveRecord(data);
      saveState(type, letter, data.licenseNumber);

      console.log("Saved:", data.licenseNumber, data.name);

      // 3️⃣ Go back
      await page.goBack();
      await delay(500);

      // 4️⃣ Reload to stabilize Salesforce
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("table.table tbody tr", { timeout: 15000 });

      rows = await page.$$eval(
        "table.table tbody tr",
        r => r.length
      );

      await delay(300);
    }
  }

  async function paginate(type, letter) {
    while (true) {
      await scrapeCurrentPage(type, letter);

      const next = await page.$("a[title='Next page']");
      if (!next) break;

      const first = await page.$eval(
        "table.table tbody tr td:first-child",
        el => el.innerText.trim()
      );

      await page.evaluate(() => {
        const text = document.querySelector(".pagination").innerText;
        const pageNum = parseInt(text.match(/Page (\d+)/)[1], 10);
        goPage(pageNum + 1);
      });

      try {
        await page.waitForFunction(
          prev => {
            const el = document.querySelector(
              "table.table tbody tr td"
            );
            return el && el.innerText.trim() !== prev;
          },
          { timeout: 15000 },
          first
        );
      } catch {
        break;
      }
    }
  }

  for (const t of LICENSE_TYPES) {
    if (state.type && t.value < state.type) continue;

    for (const l of LETTERS) {
      if (state.letter && l < state.letter) continue;

      console.log(`\n🔎 ${t.label} — ${l}`);
      state.lastLicense = null;

      await search(l, t.value);
      await paginate(t.value, l);

      await page.click("button.btn.btn-primary");
      await page.waitForSelector("#inputLastName");

      saveState(t.value, l, null);
    }
  }

  await browser.close();
  console.log("\nDONE");
})();
