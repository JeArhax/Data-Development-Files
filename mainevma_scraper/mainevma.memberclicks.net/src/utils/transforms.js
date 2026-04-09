'use strict';

const dayjs = require('dayjs');

/**
 * Convert a snake_case or kebab-case string to camelCase.
 */
function toCamelCase(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Recursively convert all object keys to camelCase.
 * Preserves arrays and nested objects.
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
 * Flatten a nested object into a single-level object with dot-notation keys.
 * Arrays of primitives become comma-joined strings.
 * Arrays of objects are JSON.stringify'd.
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}_${key}` : key;
    if (value === null || value === undefined) {
      result[fullKey] = '';
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result[fullKey] = '';
      } else if (typeof value[0] === 'object') {
        // Array of objects → stringify for CSV cell
        result[fullKey] = JSON.stringify(value);
      } else {
        // Array of primitives → join
        result[fullKey] = value.join(', ');
      }
    } else if (typeof value === 'object') {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/**
 * Return current UTC timestamp in ISO 8601 format.
 */
function nowIso() {
  return dayjs().toISOString();
}

/**
 * Safely parse a JSON string; returns null on failure.
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

module.exports = { toCamelCase, formatKeyNamesToCamelCase, flattenObject, nowIso, safeJsonParse };
