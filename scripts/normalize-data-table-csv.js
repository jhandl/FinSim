#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function printUsage() {
  console.log('Usage: node scripts/normalize-data-table-csv.js [input.csv] [output.csv]');
  console.log('Defaults: input=docs/demo-data-main.csv, output=<input>-normalized.csv');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => String(v || '').trim() !== ''));
}

function escapeCsvCell(value) {
  const text = String(value == null ? '' : value);
  if (text.indexOf('"') !== -1 || text.indexOf(',') !== -1 || text.indexOf('\n') !== -1) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function parseComparableNumber(rawValue) {
  const raw = String(rawValue == null ? '' : rawValue).trim();
  if (raw === '') return null;

  if (raw.endsWith('%')) {
    const pct = parseFloat(raw.slice(0, -1).replace(/[^\d.\-]/g, ''));
    if (!Number.isFinite(pct)) return null;
    return Math.round((pct / 100) * 1000) / 1000;
  }

  const negative = raw.indexOf('-') !== -1 || (raw.startsWith('(') && raw.endsWith(')'));
  const numeric = raw.replace(/[^\d.]/g, '');
  if (numeric === '') return null;

  const parsed = parseFloat(numeric);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function formatComparableValue(rawValue) {
  const raw = String(rawValue == null ? '' : rawValue).trim();
  if (raw === '') return '';

  const numeric = parseComparableNumber(raw);
  if (numeric === null) return raw;
  if (Object.is(numeric, -0)) return '0';
  if (Number.isInteger(numeric)) return String(numeric);
  return String(numeric);
}

function isAllZeroNumericColumn(rows, columnIndex) {
  let sawNumeric = false;

  for (let i = 0; i < rows.length; i += 1) {
    const raw = String((rows[i] && rows[i][columnIndex]) || '').trim();
    if (raw === '') continue;

    const numeric = parseComparableNumber(raw);
    if (numeric === null) return false;

    sawNumeric = true;
    if (Math.abs(numeric) > 1e-12) return false;
  }

  return sawNumeric;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const inputPath = path.resolve(args[0] || 'docs/demo-data-main.csv');
  const outputPath = path.resolve(
    args[1] || inputPath.replace(/\.csv$/i, '-normalized.csv')
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${inputPath}`);
  }

  const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
  if (rows.length < 2) {
    throw new Error(`Expected header + data rows in: ${inputPath}`);
  }

  const header = rows[0];
  const dataRows = rows.slice(1);

  // Keep by index, not by header name. Labels can repeat across table sections.
  const keepMask = header.map((_, i) => !isAllZeroNumericColumn(dataRows, i));
  const keepIndexes = [];
  const removedColumns = [];

  for (let i = 0; i < keepMask.length; i += 1) {
    if (keepMask[i]) {
      keepIndexes.push(i);
    } else {
      removedColumns.push(`${i + 1}:${header[i]}`);
    }
  }

  const outputRows = [];
  outputRows.push(keepIndexes.map((i) => header[i]));

  for (let r = 0; r < dataRows.length; r += 1) {
    const row = dataRows[r];
    outputRows.push(keepIndexes.map((i) => formatComparableValue(row[i])));
  }

  fs.writeFileSync(outputPath, `${toCsv(outputRows)}\n`, 'utf8');

  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Columns kept: ${keepIndexes.length}/${header.length}`);
  console.log(
    `Removed all-zero numeric columns: ${removedColumns.length === 0 ? '(none)' : removedColumns.join(', ')}`
  );
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
