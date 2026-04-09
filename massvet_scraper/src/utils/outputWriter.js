'use strict';

/**
 * outputWriter.js — Write member records to JSONL and CSV.
 *
 * JSONL: one JSON object per line — handles nested/dynamic schemas perfectly.
 * CSV:   flattened, human-readable — each record is one row, headers are the
 *        union of all keys across all records (handles variable schemas).
 *
 * Per project spec:
 *   - Arrays of primitives  → comma-separated string
 *   - Arrays of objects     → JSON.stringify (stored in single CSV cell)
 *   - Nested objects        → flattened with underscore-joined keys
 */

const fs   = require('fs');
const path = require('path');
const logger = require('./logger');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`[writer] Created output directory: ${dir}`);
  }
}

/**
 * Flatten a single record object into a flat key→string map for CSV.
 * Only flattens nested plain objects. Arrays are serialised per spec.
 */
function flattenRecord(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}_${key}` : key;
    if (value === null || value === undefined) {
      result[fullKey] = '';
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result[fullKey] = '';
      } else if (typeof value[0] === 'object' && value[0] !== null) {
        // Array of objects → JSON.stringify into single cell
        result[fullKey] = JSON.stringify(value);
      } else {
        // Array of primitives → join with comma
        result[fullKey] = value.join(', ');
      }
    } else if (typeof value === 'object') {
      // Nested plain object → recurse
      Object.assign(result, flattenRecord(value, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

/**
 * Escape a CSV cell value: wrap in quotes if it contains commas, newlines, or quotes.
 */
function escapeCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeJsonl(records, filePath, append = false) {
  ensureDir(path.dirname(filePath));
  const flag  = append ? 'a' : 'w';
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(filePath, lines, { flag, encoding: 'utf-8' });
  logger.info(`[writer] JSONL → ${filePath} (${records.length} records)`);
}

function writeCsv(records, filePath) {
  ensureDir(path.dirname(filePath));

  if (records.length === 0) {
    logger.warn('[writer] No records to write to CSV');
    fs.writeFileSync(filePath, '', { encoding: 'utf-8' });
    return;
  }

  // Flatten each record individually — NO cross-record prefix
  const flattened = records.map((r) => flattenRecord(r));

  // Build union of all column keys, preserving insertion order
  const keySet  = new Set();
  const allKeys = [];
  for (const row of flattened) {
    for (const key of Object.keys(row)) {
      if (!keySet.has(key)) {
        keySet.add(key);
        allKeys.push(key);
      }
    }
  }

  // Render CSV
  const header = allKeys.map(escapeCell).join(',');
  const rows   = flattened.map((row) =>
    allKeys.map((k) => escapeCell(row[k] ?? '')).join(',')
  );

  fs.writeFileSync(filePath, [header, ...rows].join('\n') + '\n', { encoding: 'utf-8' });
  logger.info(`[writer] CSV → ${filePath} (${records.length} records, ${allKeys.length} columns)`);
}

function writeOutputs(records, outputDir, jsonlFilename, csvFilename) {
  const jsonlPath = path.join(outputDir, jsonlFilename);
  const csvPath   = path.join(outputDir, csvFilename);
  writeJsonl(records, jsonlPath);
  writeCsv(records, csvPath);
  return { jsonlPath, csvPath };
}

module.exports = { writeJsonl, writeCsv, writeOutputs, flattenRecord };
