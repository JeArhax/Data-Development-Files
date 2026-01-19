const fs = require("fs");
const path = require("path");

function createJsonlWriter(filePath) {
  const stream = fs.createWriteStream(filePath, { flags: "a" });

  return {
    write: (obj) => {
      stream.write(JSON.stringify(obj) + "\n");
    },
    close: () => stream.end(),
  };
}

function createCsvWriter(filePath, headers) {
  const stream = fs.createWriteStream(filePath, { flags: "a" });
  let headerWritten = false;

  return {
    write: (obj) => {
      if (!headerWritten) {
        stream.write(headers.join(",") + "\n");
        headerWritten = true;
      }

      const row = headers.map((h) => {
        const val = obj[h];
        if (val === null || val === undefined) return "";
        return `"${String(val).replace(/"/g, '""')}"`;
      });

      stream.write(row.join(",") + "\n");
    },
    close: () => stream.end(),
  };
}

module.exports = {
  createJsonlWriter,
  createCsvWriter,
};
