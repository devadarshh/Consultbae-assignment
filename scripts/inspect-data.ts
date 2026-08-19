/**
 * scripts/inspect-data.ts
 *
 * Reads the three assignment CSVs and prints useful data-quality statistics:
 *   - per-source schema + record counts
 *   - empty cells, exact-duplicate rows
 *   - format variants for phones, cities, dates, CTC, skills, status
 *   - cross-source duplicate candidates (normalized email / phone)
 *
 * Run with: npm run inspect
 */
import { readCsvFile } from '../packages/shared/src/csv';

const DATA_DIR = process.env.DATA_DIR ?? 'data';
const SOURCES = [
  { key: 'naukri', file: `${DATA_DIR}/source1_naukri_applicants.csv` },
  { key: 'gig', file: `${DATA_DIR}/source2_gig_workers.csv` },
  { key: 'cbnexus', file: `${DATA_DIR}/source3_cbnexus_contacts.csv` },
];

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}
function normPhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}
function summarize(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.map(([v, c]) => `${JSON.stringify(v)} (${c})`).join(', ');
}

console.log('==============================================');
console.log('DATA INSPECTION');
console.log('==============================================\n');

const allEmails: Record<string, string[]> = {}; // normEmail -> [source]
const allPhones: Record<string, string[]> = {};

for (const src of SOURCES) {
  const rows = readCsvFile(src.file);
  const header = rows[0];
  const dataRows = rows.slice(1);
  const nonEmpty = dataRows.filter((r) => r.some((c) => c.trim() !== ''));

  console.log(`--- ${src.key} (${src.file}) ---`);
  console.log(`Header: ${JSON.stringify(header)}`);
  console.log(`Total lines after header: ${dataRows.length}`);
  console.log(`Non-empty data rows: ${nonEmpty.length}`);
  console.log(`Completely empty rows: ${dataRows.length - nonEmpty.length}`);

  // column counts
  const colCounts = new Map<number, number>();
  for (const r of dataRows) {
    if (r.some((c) => c.trim() !== '')) colCounts.set(r.length, (colCounts.get(r.length) ?? 0) + 1);
  }
  console.log(`Column-count distribution (non-empty rows): ${summarize([...colCounts.entries()].map(([k, v]) => `${k} cols:${v}`))}`);

  // exact duplicate rows
  const seen = new Map<string, number>();
  for (const r of dataRows) {
    const key = r.join('|');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, c]) => c > 1);
  console.log(`Exact-duplicate rows: ${dups.length ? dups.length : 0}`);
  for (const [k, c] of dups) console.log(`   x${c}: ${k}`);

  // per-column empties + variants
  for (let ci = 0; ci < header.length; ci++) {
    const colVals = nonEmpty.map((r) => r[ci] ?? '');
    const empty = colVals.filter((v) => v.trim() === '').length;
    const nonEmptyVals = colVals.filter((v) => v.trim() !== '');
    console.log(`\n  Column[${ci}] "${header[ci]}": empty=${empty}/${nonEmpty.length}`);
    if (nonEmptyVals.length) {
      console.log(`    distinct raw values: ${summarize(nonEmptyVals)}`);
    }
  }

  // register normalized emails/phones for cross-source candidates
  const emailCol = header.findIndex((h) => /email/i.test(h));
  const phoneCol = header.findIndex((h) => /phone/i.test(h));
  const nameCol = header.findIndex((h) => /name/i.test(h));
  for (const r of nonEmpty) {
    const name = (r[nameCol] ?? '').trim();
    const email = emailCol >= 0 ? (r[emailCol] ?? '').trim() : '';
    const phone = phoneCol >= 0 ? (r[phoneCol] ?? '').trim() : '';
    if (email) {
      const n = normEmail(email);
      if (!allEmails[n]) allEmails[n] = [];
      allEmails[n].push(`${src.key}:${name}`);
    }
    if (phone) {
      const n = normPhone(phone);
      if (!allPhones[n]) allPhones[n] = [];
      allPhones[n].push(`${src.key}:${name}`);
    }
  }

  console.log('\n');
}

console.log('==============================================');
console.log('CROSS-SOURCE DUPLICATE CANDIDATES');
console.log('==============================================');
console.log('\nBy normalized EMAIL:');
const emailDups = Object.entries(allEmails).filter(([, v]) => v.length > 1);
for (const [e, srcs] of emailDups) console.log(`  ${e} -> ${srcs.join(' | ')}`);
if (!emailDups.length) console.log('  (none)');

console.log('\nBy normalized PHONE:');
const phoneDups = Object.entries(allPhones).filter(([, v]) => v.length > 1);
for (const [p, srcs] of phoneDups) console.log(`  ${p} -> ${srcs.join(' | ')}`);
if (!phoneDups.length) console.log('  (none)');

// phones that appear under different source-names but same normalized value within one source
console.log('\nDistinct normalized emails: ', Object.keys(allEmails).length);
console.log('Distinct normalized phones: ', Object.keys(allPhones).length);