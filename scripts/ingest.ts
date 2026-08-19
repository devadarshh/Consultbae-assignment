/**
 * scripts/ingest.ts
 *
 * Reads the three CSVs, normalizes, resolves people, and writes the canonical
 * database (Person / SourceRecord / Skill / PersonSkill).
 *
 * Run with: npm run ingest
 * Idempotent: deletes existing rows from the ingest tables before re-inserting.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { parseNaukri, parseGig, parseCbnexus } from '../packages/shared/src/sources';
import { resolveRecords } from '../packages/shared/src/entity-resolution';
import type { CleanIssue } from '../packages/shared/src/types';

const DATA_DIR = process.env.DATA_DIR ?? 'data';
const prisma = new PrismaClient();

function readSource(file: string, parser: (t: string) => { source: string; records: unknown[]; issues: CleanIssue[] }) {
  const text = readFileSync(`${DATA_DIR}/${file}`, 'utf-8');
  return parser(text);
}

async function main() {
  console.log('Reading + parsing source CSVs...');
  const naukri = readSource('source1_naukri_applicants.csv', parseNaukri);
  const gig = readSource('source2_gig_workers.csv', parseGig);
  const cbnexus = readSource('source3_cbnexus_contacts.csv', parseCbnexus);

  const all = [...naukri.records, ...gig.records, ...cbnexus.records] as Parameters<typeof resolveRecords>[0];
  console.log(`Parsed ${all.length} records (naukri=${naukri.records.length}, gig=${gig.records.length}, cbnexus=${cbnexus.records.length})`);

  console.log('Resolving people...');
  const result = resolveRecords(all);
  console.log(`Resolved ${result.people.length} unique people (${result.decisions.length} merges, ${result.rejected.length} conflicts)`);

  console.log('Writing to database...');
  await prisma.$transaction(async (tx) => {
    // Idempotency: wipe previous ingest data (cascades from SourceRecord/Person).
    await tx.skillClassification.deleteMany();
    await tx.audioSubmission.deleteMany();
    await tx.personSkill.deleteMany();
    await tx.sourceRecord.deleteMany();
    await tx.person.deleteMany();
    await tx.skill.deleteMany();

    const skillNameToId = new Map<string, number>();

    for (const person of result.people) {
      const created = await tx.person.create({
        data: {
          canonicalName: person.canonicalName,
          email: person.email,
          phone: person.phone,
          city: person.city,
          experienceYears: person.experienceYears,
          currentCtc: person.ctc,
          ctcMalformed: person.ctcMalformed,
        },
      });

      const personSkills = new Set<string>();
      for (const r of person.records) {
        await tx.sourceRecord.create({
          data: {
            personId: created.id,
            source: r.source,
            sourceRow: r.sourceRow,
            rawData: r.rawData as object,
            matchedBy: r.matchedBy,
          },
        });

        for (const skillName of r.skills) personSkills.add(skillName);
      }

      for (const skillName of personSkills) {
        let skillId = skillNameToId.get(skillName);
        if (skillId === undefined) {
          const skill = await tx.skill.create({ data: { name: skillName } });
          skillId = skill.id;
          skillNameToId.set(skillName, skillId);
        }
        await tx.personSkill.create({ data: { personId: created.id, skillId } });
      }
    }
  });

  console.log('\n===== INGESTION SUMMARY =====');
  console.log(`Naukri records:          ${naukri.records.length}`);
  console.log(`Gig worker records:      ${gig.records.length}`);
  console.log(`CBNexus records:         ${cbnexus.records.length}`);
  console.log(`Total source records:    ${all.length}`);
  console.log(`Unique people:           ${result.people.length}`);
  console.log(`Merged duplicate records: ${result.decisions.length}`);
  console.log(`Potential conflicts:     ${result.rejected.length}`);
  console.log(`Unmatched records:       0`);

  console.log('\nData-quality issues detected during parse:');
  for (const s of [naukri, gig, cbnexus] as { source: string; issues: CleanIssue[] }[]) {
    console.log(`  ${s.source}: ${s.issues.length} issue(s)`);
  }

  const issueExamples = [...naukri.issues, ...gig.issues, ...cbnexus.issues]
    .filter((i) => !i.resolved)
    .slice(0, 5);
  if (issueExamples.length) {
    console.log('\nWARNING: unresolved issues (records kept, flagged):');
    for (const i of issueExamples) console.log(`  ${i.type}: ${i.detail}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});