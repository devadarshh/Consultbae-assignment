/**
 * Minimal RFC-4180-ish CSV parser.
 *
 * Handles quoted fields containing commas (e.g. skill_tags = "n8n, sql"), escaped
 * double quotes, and CRLF/LF line endings. We deliberately do not pull in a CSV
 * library so the parsing behaviour (and its edge cases) stays easy to defend.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else if (ch === '\r') {
      // skip CR, handled by \n
    } else {
      field += ch;
    }
  }

  // flush last field/row
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

import { readFileSync } from 'node:fs';

export function readCsvFile(path: string): string[][] {
  return parseCsv(readFileSync(path, 'utf-8'));
}