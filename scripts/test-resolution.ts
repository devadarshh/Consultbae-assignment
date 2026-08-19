/**
 * Quick sanity run of parse + resolve against the real files (no DB).
 * Prints person counts and the two planted trap cases for verification.
 */
import { readFileSync } from 'node:fs';
import { parseNaukri, parseGig, parseCbnexus } from '../packages/shared/src/sources';
import { resolveRecords } from '../packages/shared/src/entity-resolution';

const DATA = process.env.DATA_DIR ?? 'data';

const naukri = parseNaukri(readFileSync(`${DATA}/source1_naukri_applicants.csv`, 'utf-8'));
const gig = parseGig(readFileSync(`${DATA}/source2_gig_workers.csv`, 'utf-8'));
const cbnexus = parseCbnexus(readFileSync(`${DATA}/source3_cbnexus_contacts.csv`, 'utf-8'));

const all = [...naukri.records, ...gig.records, ...cbnexus.records];
const res = resolveRecords(all);

console.log('=== SOURCE COUNTS ===');
console.log(`naukri: ${naukri.records.length} records, ${naukri.issues.length} issues`);
console.log(`gig:    ${gig.records.length} records, ${gig.issues.length} issues`);
console.log(`cbnexus:${cbnexus.records.length} records, ${cbnexus.issues.length} issues`);
console.log(`total:  ${all.length} records`);

console.log('\n=== RESOLUTION ===');
console.log(`unique people: ${res.people.length}`);
console.log(`merge decisions: ${res.decisions.length}`);
console.log(`rejected pairs: ${res.rejected.length}`);

console.log('\n=== TRAP CASES ===');
const arjunMehta = res.people.filter((p) => p.canonicalName.toLowerCase().includes('arjun mehta'));
for (const p of arjunMehta) {
  console.log(`Arjun Mehta: phone=${p.phone} email=${p.email} city=${p.city} records=[${p.records.map((r) => `${r.source}:${r.sourceRow}`).join(', ')}]`);
}
const deepakNair = res.people.filter((p) => p.canonicalName.toLowerCase().includes('deepak nair'));
for (const p of deepakNair) {
  console.log(`Deepak Nair: phone=${p.phone} email=${p.email} city=${p.city} records=[${p.records.map((r) => `${r.source}:${r.sourceRow}`).join(', ')}]`);
}

console.log('\n=== PEOPLE WITH >1 RECORD ===');
for (const p of res.people.filter((p) => p.records.length > 1)) {
  console.log(`${p.canonicalName} (${p.city}) via [${p.records.map((r) => r.matchedBy).join(',')}] <- ${p.records.map((r) => `${r.source}:${r.sourceRow}`).join(', ')}`);
}

console.log('\n=== REJECTED PAIRS ===');
for (const r of res.rejected) {
  const a = all.find((x) => x.id === r.recordAId)!;
  const b = all.find((x) => x.id === r.recordBId)!;
  console.log(`${a.name}(${a.source}:${a.sourceRow}) vs ${b.name}(${b.source}:${b.sourceRow}) -> ${r.reason}`);
}

console.log('\n=== ISSUES ===');
for (const s of [naukri, gig, cbnexus]) {
  for (const iss of s.issues) console.log(`${s.source} row ${iss.row}: [${iss.type}] ${iss.detail}`);
}