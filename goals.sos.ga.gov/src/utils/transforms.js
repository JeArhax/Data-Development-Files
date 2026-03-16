// ============================================================
// utils/transforms.js
// ============================================================

/**
 * Convert any string to camelCase.
 * Handles snake_case, kebab-case, PascalCase, spaces, and Salesforce __c suffix.
 */
function toCamelCase(str) {
  if (!str || typeof str !== 'string') return str;

  // Strip Salesforce custom field suffix __c
  let s = str.replace(/__c$/i, '');

  // Replace separators (_, -, space) and capitalize next letter
  s = s
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase());

  return s;
}

/**
 * Recursively convert all keys of an object (or array of objects) to camelCase.
 */
function formatKeyNamesToCamelCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map(formatKeyNamesToCamelCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamelCase(k), formatKeyNamesToCamelCase(v)])
    );
  }
  return obj;
}

/**
 * Flatten a nested object into a single-level object.
 * Arrays of primitives → comma-separated string.
 * Arrays of objects → JSON.stringify (for CSV cell).
 * @param {Object} obj
 * @param {string} prefix
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (value === null || value === undefined) {
      result[newKey] = null;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result[newKey] = null;
      } else if (typeof value[0] === 'object' && value[0] !== null) {
        // Array of objects → stringify for single CSV cell
        result[newKey] = JSON.stringify(value);
      } else {
        // Array of primitives → comma-separated
        result[newKey] = value.join(', ');
      }
    } else if (typeof value === 'object') {
      // Recurse into nested object
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Serialize a record to JSONL string (single line).
 */
function toJsonlLine(record) {
  return JSON.stringify(record);
}

/**
 * Clean a value for CSV output.
 * Null/undefined → empty string.
 * Objects/arrays → JSON.stringify.
 */
function cleanForCsv(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Given an array of flat record objects, return CSV string (with header row).
 */
function recordsToCsv(records) {
  if (!records.length) return '';
  const headers = [...new Set(records.flatMap(Object.keys))];
  const headerLine = headers.map((h) => `"${h}"`).join(',');
  const rows = records.map((rec) =>
    headers.map((h) => {
      const v = cleanForCsv(rec[h]);
      return `"${v.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headerLine, ...rows].join('\n');
}

module.exports = {
  toCamelCase,
  formatKeyNamesToCamelCase,
  flattenObject,
  toJsonlLine,
  recordsToCsv,
  cleanForCsv,
};
