/**
 * utils/transforms.js — Data transformation utilities
 */

const toCamelCase = (str) => {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase());
};

const formatKeysToCamelCase = (obj) => {
  if (Array.isArray(obj)) return obj.map(formatKeysToCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamelCase(k), formatKeysToCamelCase(v)])
    );
  }
  return obj;
};

const flattenObject = (obj, prefix = '', result = {}) => {
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flattenObject(val, newKey, result);
    } else if (Array.isArray(val)) {
      result[newKey] = JSON.stringify(val);
    } else {
      result[newKey] = val ?? '';
    }
  }
  return result;
};

const toIsoTimestamp = () => new Date().toISOString();

module.exports = { toCamelCase, formatKeysToCamelCase, flattenObject, toIsoTimestamp };
