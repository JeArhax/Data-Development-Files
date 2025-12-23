const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const BASE_URL = "https://online.bvm.nm.gov/public/licensesearch";
const LAST_SEED_FILE = path.join(__dirname, "last_seed.txt");

// ================= HELPERS =================
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    throw new Error(`Timeout waiting for ${selector}`);
}

function getLastSeed() {
    if (fs.existsSync(LAST_SEED_FILE)) {
        return fs.readFileSync(LAST_SEED_FILE, "utf-8").trim();
    }
    return null;
}

function saveLastSeed(seed) {
    fs.writeFileSync(LAST_SEED_FILE, seed, "utf-8");
}

// ================= OUTPUT =================
const jsonlStream = fs.createWriteStream("NM-Vet.jsonl", { flags: "a" });
const csvStream = fs.createWriteStream("NM-Vet.csv", { flags: "a" });

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

// ================= SORT =================
async function sortNameAscending(page) {
    await page.evaluate(() => {
        const headers = [...document.querySelectorAll("th")];
        const nameHeader = headers.find(th => th.textContent.trim().startsWith("Name"));
        if (nameHeader) nameHeader.click();
    });
    await delay(300 + Math.random() * 200);
}

// ================= EXTRACT =================
async function extractCurrentPage(page) {
    await page.waitForSelector(
        ".p-datatable-table-container tr.p-datatable-selectable-row",
        { timeout: 15000 }
    );

    return await page.$$eval(
        ".p-datatable-table-container tr.p-datatable-selectable-row",
        rows => rows
            .map(row => {
                const cells = [...row.querySelectorAll("td")];
                const getText = td => td ? (td.innerText || td.textContent || "").replace(/\s+/g, " ").trim() : "";
                return {
                    fullName: getText(cells[0]),
                    licenseNumber: getText(cells[1]),
                    licenseType: getText(cells[2]),
                    status: getText(cells[3]),
                    birthDate: getText(cells[4]),
                    issueDate: getText(cells[5]),
                    expirationDate: getText(cells[6])
                };
            })
            .filter(r => r.licenseNumber)
    );
}
// ---------------- PAGINATION FUNCTION ----------------
async function goNextPage(page, prevFirstLicense) {
    const nextBtn = await page.$("button.p-paginator-next");
    if (!nextBtn) return false;

    const disabled = await page.evaluate(el => el.classList.contains("p-disabled"), nextBtn);
    if (disabled) return false;

    await nextBtn.click();

    try {
        await page.waitForFunction(
            (prev) => {
                const el = document.querySelector(".p-datatable-tbody tr.p-datatable-selectable-row td:nth-child(2)");
                return !el || el.innerText.trim() !== prev;
            },
            { timeout: 30000 },
            prevFirstLicense
        );
    } catch {
        console.log("Timeout waiting for next page, assuming last page or slow load.");
        return false;
    }

    await delay(1500);
    return true;
}

// ================= MAIN =================
(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null
    });
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    const seeds = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    const lastSeed = getLastSeed();
    let startIndex = lastSeed ? seeds.indexOf(lastSeed) + 1 : 0;

    // ================= DUPLICATE HANDLING =================
    const seen = new Set();
    if (fs.existsSync("NM-Vet.jsonl")) {
        const lines = fs.readFileSync("NM-Vet.jsonl", "utf-8").split("\n");
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const obj = JSON.parse(line);
                if (obj.licenseNumber) seen.add(obj.licenseNumber);
            } catch {}
        }
    }
    console.log(`Loaded ${seen.size} existing records to skip duplicates.`);

    for (let i = startIndex; i < seeds.length; i++) {
        const seed = seeds[i];
        console.log(`\nSearching Last Name: ${seed}`);

        try {
            // Wait for input & clear it
            const lastNameInput = await waitForVisible(page, "#LastName0");
            await lastNameInput.evaluate(el => el.value = "");
            await delay(500 + Math.random() * 500);
            await lastNameInput.type(seed, { delay: 100 });

            await delay(400 + Math.random() * 400);

            // Click search
            await page.evaluate(() => {
                const btn = document.querySelector('button[aria-label="Search"]');
                btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            // Wait for results
            await page.waitForSelector(".p-datatable-tbody tr.p-datatable-selectable-row", { timeout: 30000 });
            const rowsCount = await page.$$eval(".p-datatable-tbody tr.p-datatable-selectable-row", rows => rows.length);
            console.log("Rows found:", rowsCount);

            await sortNameAscending(page);

            let totalNew = 0;
            let pageNum = 1;

            while (true) {
                console.log(`Processing page ${pageNum} for seed ${seed}`);

                // Capture first license before filtering duplicates
                const prevFirstLicense = await page.$eval(
                    ".p-datatable-tbody tr.p-datatable-selectable-row td:nth-child(2)",
                    el => el.innerText.trim()
                );

                const records = await extractCurrentPage(page);
                console.log(`Rows on this page: ${records.length}`);

                // ================= DUPLICATE CHECK =================
                for (const rec of records) {
                    if (!seen.has(rec.licenseNumber)) {
                        seen.add(rec.licenseNumber);
                        writeJSONL(rec);
                        writeCSV(rec);
                        totalNew++;
                    } else {
                        console.log(`Skipping duplicate: ${rec.licenseNumber}`);
                    }
                }

                   // Use goNextPage function
    const hasNext = await goNextPage(page, prevFirstLicense);
    if (!hasNext) break;

    pageNum++;

                // Wait until first license changes
                try {
                    await page.waitForFunction(
                        prev => {
                            const el = document.querySelector(".p-datatable-tbody tr.p-datatable-selectable-row td:nth-child(2)");
                            return el && el.innerText.trim() !== prev;
                        },
                        { timeout: 30000 },
                        prevFirstLicense
                    );
                } catch {
                    console.log("Timeout waiting for next page, assuming last page.");
                    break;
                }

                pageNum++;
                await delay(1500);
            }

            console.log(`Saved ${totalNew} records for ${seed}`);

           // Reload page AFTER all pages processed for a seed
            console.log(`🔄 Reloading page before next seed...`);
            await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
            await delay(1500); 

saveLastSeed(seed);


        } catch (err) {
            console.error(`Error on seed ${seed}:`, err.message);
            saveLastSeed(seed);
            await delay(5000);
        }
    }

    await browser.close();
    console.log("\nScraping completed.");
})();
