/**
 * Entity resolution across the three sources.
 *
 * No common ID exists, so we resolve people with a tiered, conservative strategy:
 *
 *   1. Exact normalized EMAIL  -> same person (very high confidence)
 *   2. Exact normalized PHONE  -> same person (very high confidence)
 *   3. Normalized NAME + CITY  -> same person ONLY IF:
 *        a. no shared email/phone already links the two groups, AND
 *        b. merging would not give the person two DIFFERENT phones or two DIFFERENT
 *           emails from the two groups (distinct strong identifiers = conflicting
 *           evidence -> keep separate), AND
 *        c. when BOTH groups have non-empty skill sets, the sets must overlap
 *           (fully disjoint, non-empty skill sets are conflicting evidence).
 *   4. Otherwise -> keep separate (never auto-merge on weak evidence).
 *
 * Rules 3b/3c are exactly what separates the two planted same-name pairs:
 *   - the two "Arjun Mehta"s (Noida) — different phones and disjoint skills
 *   - the two "Deepak Nair"s — different cities
 */
import type { PersonGroup, RejectedMatch, ResolutionResult, SourceRecord } from './types';

function normNameKey(r: SourceRecord): string {
  return r.name.toLowerCase();
}

export function resolveRecords(records: SourceRecord[]): ResolutionResult {
  const n = records.length;
  const parent = records.map((_, i) => i);

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const decisions: ResolutionResult['decisions'] = [];
  const rejected: RejectedMatch[] = [];

  // ---- Pass 1: strong identifiers ---------------------------------------------
  const byEmail = new Map<string, number>();
  const byPhone = new Map<string, number>();

  const setMatchedBy = (r: SourceRecord, by: string) => {
    // First strong signal wins; do not overwrite an earlier 'unique' or identifier match.
    if (r.matchedBy === 'unique') r.matchedBy = by;
  };

  for (const r of records) {
    if (r.email) {
      const existing = byEmail.get(r.email);
      if (existing !== undefined) {
        if (find(existing) !== find(r.id)) {
          union(existing, r.id);
          decisions.push({ fromRecordId: r.id, intoPersonId: existing, by: 'email', note: `exact email ${r.email}` });
        }
        setMatchedBy(r, 'email');
      } else {
        byEmail.set(r.email, r.id);
      }
    }
    if (r.phone) {
      const existing = byPhone.get(r.phone);
      if (existing !== undefined) {
        if (find(existing) !== find(r.id)) {
          union(existing, r.id);
          decisions.push({ fromRecordId: r.id, intoPersonId: existing, by: 'phone', note: `exact phone ${r.phone}` });
        }
        setMatchedBy(r, 'phone');
      } else {
        byPhone.set(r.phone, r.id);
      }
    }
  }

  // ---- Build groups ------------------------------------------------------------
  const groupByRoot = new Map<number, SourceRecord[]>();
  for (const r of records) {
    const root = find(r.id);
    if (!groupByRoot.has(root)) groupByRoot.set(root, []);
    groupByRoot.get(root)!.push(r);
  }
  let groups: SourceRecord[][] = [...groupByRoot.values()];

  // ---- Pass 2: name + city ------------------------------------------------------
  // Iterate pairs of groups; merge only when the evidence rules pass.
  const tryMerge = (ga: SourceRecord[], gb: SourceRecord[]): { ok: boolean; reason?: string } => {
    const nameA = normNameKey(ga[0]);
    const nameB = normNameKey(gb[0]);
    if (nameA !== nameB) return { ok: false, reason: 'name differs' };

    const cityA = ga[0].city;
    const cityB = gb[0].city;
    if (cityA !== cityB) return { ok: false, reason: `city differs (${cityA} vs ${cityB})` };

    const emailsA = new Set(ga.map((r) => r.email).filter(Boolean) as string[]);
    const emailsB = new Set(gb.map((r) => r.email).filter(Boolean) as string[]);
    const phonesA = new Set(ga.map((r) => r.phone).filter(Boolean) as string[]);
    const phonesB = new Set(gb.map((r) => r.phone).filter(Boolean) as string[]);

    // Shared identifier would already have unioned them; if present here something's off.
    for (const e of emailsA) if (emailsB.has(e)) return { ok: false, reason: 'already linked by email' };
    for (const p of phonesA) if (phonesB.has(p)) return { ok: false, reason: 'already linked by phone' };

    // Two different strong identifiers of the same kind = conflicting evidence.
    if (emailsA.size > 0 && emailsB.size > 0) return { ok: false, reason: 'two distinct emails across groups' };
    if (phonesA.size > 0 && phonesB.size > 0) return { ok: false, reason: 'two distinct phones across groups' };

    // Disjoint non-empty skill sets = conflicting evidence.
    const skillsA = new Set(ga.flatMap((r) => r.skills));
    const skillsB = new Set(gb.flatMap((r) => r.skills));
    if (skillsA.size > 0 && skillsB.size > 0) {
      let overlap = false;
      for (const s of skillsA) if (skillsB.has(s)) { overlap = true; break; }
      if (!overlap) return { ok: false, reason: 'disjoint skill sets' };
    }

    return { ok: true };
  };

  // Keep merging until a full pass produces no new merges (pairs change after merge).
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const res = tryMerge(groups[i], groups[j]);
        if (res.ok) {
          const merged = [...groups[i], ...groups[j]];
          for (const r of groups[j]) setMatchedBy(r, 'name_city');
          decisions.push({
            fromRecordId: groups[j][0].id,
            intoPersonId: groups[i][0].id,
            by: 'name_city',
            note: `name+city ${groups[i][0].name} / ${groups[i][0].city}`,
          });
          groups = [...groups.slice(0, i), merged, ...groups.slice(i + 1, j), ...groups.slice(j + 1)];
          changed = true;
          break outer;
        } else if (res.reason !== 'name differs') {
          // Only surface meaningful near-misses (same name but conflicting evidence).
          rejected.push({ recordAId: groups[i][0].id, recordBId: groups[j][0].id, reason: res.reason! });
        }
      }
    }
  }

  // ---- Canonical person fields ---------------------------------------------------
  const people: PersonGroup[] = groups.map((g) => {
    // Anchor (the record that first established identity) first, then by source priority.
    const sorted = [...g].sort((a, b) => {
      if (a.matchedBy === 'unique' && b.matchedBy !== 'unique') return -1;
      if (b.matchedBy === 'unique' && a.matchedBy !== 'unique') return 1;
      if (a.source === 'naukri') return -1;
      if (b.source === 'naukri') return 1;
      return a.source.localeCompare(b.source);
    });

    const nameCandidates = sorted.map((r) => r.name);
    const canonicalName = pickCanonicalName(nameCandidates);

    const emails = [...new Set(g.map((r) => r.email).filter(Boolean) as string[])];
    const email = pickCanonicalEmail(emails);

    const phones = [...new Set(g.map((r) => r.phone).filter(Boolean) as string[])];
    const phone = phones.length === 1 ? phones[0] : phones[0] ?? null;

    const cities = [...new Set(g.map((r) => r.city).filter(Boolean) as string[])];
    const city = cities.length > 0 ? cities[0] : null;

    const expVals = g.map((r) => r.experienceYears).filter((v): v is number => v !== null);
    const ctcRecords = g.find((r) => r.ctc !== null);
    const matchedBySet = new Set(g.map((r) => r.matchedBy));

    return {
      records: sorted,
      canonicalName,
      email,
      phone,
      city,
      experienceYears: expVals.length ? expVals[0] : null,
      ctc: ctcRecords?.ctc ?? null,
      ctcMalformed: ctcRecords?.ctcMalformed ?? false,
      matchedBySet,
    };
  });

  // De-duplicate rejected entries (pairs can repeat across loop passes)
  const seenRej = new Set<string>();
  const uniqueRejected = rejected.filter((x) => {
    const key = `${Math.min(x.recordAId, x.recordBId)}-${Math.max(x.recordAId, x.recordBId)}-${x.reason}`;
    if (seenRej.has(key)) return false;
    seenRej.add(key);
    return true;
  });

  return { people, decisions, rejected: uniqueRejected };
}

/** Prefer a full (non-abbreviated) name; ties broken by source priority (naukri first). */
function pickCanonicalName(names: string[]): string {
  const full = names.filter((nm) => !/^[A-Z]\.\s/.test(nm));
  const pool = full.length ? full : names;
  return pool.sort((a, b) => b.length - a.length)[0];
}

/** Prefer the non-"alt." email; otherwise the shortest normalized email. */
function pickCanonicalEmail(emails: string[]): string | null {
  if (!emails.length) return null;
  const nonAlt = emails.filter((e) => !e.startsWith('alt.'));
  const pool = nonAlt.length ? nonAlt : emails;
  return pool.sort((a, b) => a.length - b.length)[0];
}