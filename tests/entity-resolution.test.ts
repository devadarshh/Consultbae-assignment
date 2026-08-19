import { describe, expect, it } from 'vitest';
import { resolveRecords } from '../packages/shared/src/entity-resolution';
import type { SourceRecord } from '../packages/shared/src/types';

let id = 1;
function rec(partial: Partial<SourceRecord>): SourceRecord {
  return {
    id: id++,
    source: partial.source ?? 'test',
    sourceRow: partial.sourceRow ?? 0,
    name: partial.name ?? 'Test Person',
    email: partial.email ?? null,
    phone: partial.phone ?? null,
    city: partial.city ?? null,
    skills: partial.skills ?? [],
    experienceYears: null,
    ctc: null,
    ctcMalformed: false,
    appliedDateIso: null,
    dateAmbiguous: false,
    rate: null,
    status: null,
    verified: null,
    projectsCompleted: null,
    rawData: {},
    matchedBy: 'unique',
    ...partial,
  };
}

describe('entity resolution', () => {
  it('merges on exact normalized email (case + whitespace insensitive)', () => {
    const a = rec({ source: 's1', email: 'John@Example.com', name: 'John Doe', city: 'Pune' });
    const b = rec({ source: 's2', email: 'john@example.com', name: 'John Doe', city: 'Pune' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(1);
  });

  it('merges on exact normalized phone across different formats', () => {
    const a = rec({ source: 's1', phone: '+919000000254', name: 'Tanvi Gupta' });
    const b = rec({ source: 's2', phone: '9000000254', name: 'Tanvi Gupta' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(1);
  });

  it('merges duplicate records within the same source by phone', () => {
    const a = rec({ source: 'naukri', phone: '09000000103', name: 'Nikhil Chopra', email: 'alt.nikhil.chopra70@example.com' });
    const b = rec({ source: 'naukri', phone: '09000000103', name: 'Nikhil Chopra', email: 'nikhil.chopra70@example.com' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(1);
  });

  it('merges R. Verma and Rohit Verma by email', () => {
    const a = rec({ source: 'naukri', email: 'rohit.verma13@mailtest.example.org', phone: '9000000294', name: 'R. Verma' });
    const b = rec({ source: 'naukri', email: 'rohit.verma13@mailtest.example.org', phone: '9000000294', name: 'Rohit Verma' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(1);
    expect(res.people[0].canonicalName).toBe('Rohit Verma');
  });

  it('merges by name+city when identifiers are absent (gig -> cbnexus)', () => {
    const a = rec({ source: 'gig', email: 'manish.bhatia3@example.com', name: 'Manish Bhatia', city: 'Noida', skills: ['pandas', 'docker'] });
    const b = rec({ source: 'cbnexus', phone: '919000000161', name: 'Manish Bhatia', city: 'Noida' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(1);
    expect(res.people[0].records.map((r) => r.matchedBy)).toContain('name_city');
  });

  it('keeps two different Arjun Mehtas separate (different phones, disjoint skills)', () => {
    const a = rec({ source: 'naukri', phone: '09000000131', email: 'arjun.mehta9@example.in', name: 'Arjun Mehta', city: 'Noida', skills: ['sql', 'selenium', 'n8n'] });
    const b = rec({ source: 'gig', email: 'arjun.mehta77@mailtest.example.org', name: 'Arjun Mehta', city: 'Noida', skills: ['fastapi', 'pandas', 'web scraping', 'zapier', 'docker', 'mysql'] });
    const c = rec({ source: 'cbnexus', phone: '+91-9000000131', name: 'Arjun Mehta', city: 'Noida' });
    const d = rec({ source: 'cbnexus', phone: '9000000272', name: 'Arjun Mehta', city: 'Noida' });
    const res = resolveRecords([a, b, c, d]);
    expect(res.people.length).toBe(2);
    const phones = res.people.map((p) => p.phone).sort();
    expect(phones).toEqual(['919000000131', '919000000272']);
  });

  it('keeps the two Deepak Nairs separate when cities differ', () => {
    const a = rec({ source: 'naukri', phone: '9000000296', email: 'deepak.nair44@example.com', name: 'Deepak Nair', city: 'Bengaluru' });
    const b = rec({ source: 'gig', email: 'deepak.nair57@example.in', name: 'Deepak Nair', city: 'New Delhi' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(2);
  });

  it('does not merge same-name people with conflicting emails', () => {
    const a = rec({ source: 's1', email: 'one@example.com', name: 'Arjun Mehta', city: 'Noida' });
    const b = rec({ source: 's2', email: 'two@example.com', name: 'Arjun Mehta', city: 'Noida' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(2);
    expect(res.rejected.length).toBeGreaterThan(0);
  });

  it('keeps people separate when there is no evidence', () => {
    const a = rec({ source: 's1', name: 'Same Name', city: 'Pune' });
    const b = rec({ source: 's2', name: 'Same Name', city: 'Mumbai' });
    const res = resolveRecords([a, b]);
    expect(res.people.length).toBe(2);
  });

  it('handles records with missing email and phone correctly', () => {
    const a = rec({ source: 's1', name: 'Only Name' });
    const res = resolveRecords([a]);
    expect(res.people.length).toBe(1);
    expect(res.people[0].records[0].matchedBy).toBe('unique');
  });

  it('records the canonical phone as a single value', () => {
    const a = rec({ source: 's1', phone: '09000000287', name: 'Priya Singh' });
    const b = rec({ source: 's2', phone: '9000000287', name: 'Priya Singh' });
    const res = resolveRecords([a, b]);
    expect(res.people[0].phone).toBe('919000000287');
  });
});