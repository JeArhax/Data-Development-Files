const fs = require("fs");
const path = require("path");

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createJsonlWriter(filePath) {
  ensureDir(filePath);
  const stream = fs.createWriteStream(filePath, { flags: "a" });
  return {
    write: obj => stream.write(JSON.stringify(obj) + "\n"),
    close: () => stream.end()
  };
}

function createCsvWriter(filePath, headers) {
  ensureDir(filePath);
  const stream = fs.createWriteStream(filePath, { flags: "a" });
  let headerWritten = false;
  return {
    write: obj => {
      if (!headerWritten) {
        stream.write(headers.join(",") + "\n");
        headerWritten = true;
      }
      const row = headers.map(h => `"${(obj[h] ?? '').toString().replace(/"/g, '""')}"`);
      stream.write(row.join(",") + "\n");
    },
    close: () => stream.end()
  };
}

module.exports = { createJsonlWriter, createCsvWriter };
