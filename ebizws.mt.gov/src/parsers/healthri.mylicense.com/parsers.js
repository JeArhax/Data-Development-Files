async function parseSearchResults(page) {
  await page.waitForSelector("#datagrid_results tr", { timeout: 10000 });

  return await page.$$eval("#datagrid_results tr", trs => {
    return trs
      .slice(1) // skip header
      .map(tr => {
        const tds = tr.querySelectorAll("td");
        if (!tds.length) return null;

        const nameAnchor = tds[0].querySelector("a");

        return {
          fullName: nameAnchor?.innerText.trim() || null,
          profileUrl: nameAnchor
            ? new URL(nameAnchor.getAttribute("href"), location.origin).href
            : null,
          licenseNumber: tds[1]?.innerText.trim() || null,
          profession: tds[3]?.innerText.trim() || null,
          licenseType: tds[4]?.innerText.trim() || null,
          licenseStatus: tds[5]?.innerText.trim() || null,
          city: tds[6]?.innerText.trim() || null,
          state: tds[7]?.innerText.trim() || null,
        };
      })
      .filter(Boolean);
  });
}

module.exports = {
  parseSearchResults,
};
