const { toCamelCase } = require("../../utils/transforms");

async function parseSearchResults(page) {
  return await page.$$eval("#datagrid_results tr", rows =>
    rows.slice(1).map(tr => {
      const cells = [...tr.querySelectorAll("td")].map(td =>
        td.innerText.trim()
      );

      if (!cells.length) return null;

      return toCamelCase({
        fullName: cells[0],
        licenseNumber: cells[1],
        licenseType: cells[2],
        licenseStatus: cells[3],
        profileLocation: `${cells[4]}, ${cells[5]}`,
        profession: cells[6]
      });
    }).filter(Boolean)
  );
}

module.exports = { parseSearchResults };
