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
import { normalizeCity, normalizeEmail, normalizeName, normalizePhone } from './normalize';
import type { PersonGroup, RejectedMatch, ResolutionResult, SourceRecord } from './types';

/**
 * A normalized "key" view of each record. The source parsers already normalize, but
 * resolving defensively makes this module self-contained and safe for any caller.
 * `index` is the record's position in the input array — union-find is indexed by it.
 */
interface KeyedRecord {
  record: SourceRecord;
  index: number;
  email: string | null;
  phone: string | null;
  nameKey: string;
  cityKey: string | null;
}

function keyRecords(records: SourceRecord[]): KeyedRecord[] {
  return records.map((r, i) => ({
    record: r,
    index: i,
    email: normalizeEmail(r.email),
    phone: normalizePhone(r.phone),
    nameKey: normalizeName(r.name).toLowerCase(),
    cityKey: normalizeCity(r.city),
  }));
}

export function resolveRecords(records: SourceRecord[]): ResolutionResult {
  const keyed = keyRecords(records);
  const n = keyed.length;
  const parent = keyed.map((_, i) => i);

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

  const setMatchedBy = (r: SourceRecord, by: string) => {
    // First strong signal wins; do not overwrite an earlier 'unique' or identifier match.
    if (r.matchedBy === 'unique') r.matchedBy = by;
  };

  // ---- Pass 1: strong identifiers ---------------------------------------------
  const byEmail = new Map<string, number>();
  const byPhone = new Map<string, number>();

  for (const r of keyed) {
    if (r.email) {
      const existing = byEmail.get(r.email);
      if (existing !== undefined) {
        if (find(existing) !== find(r.index)) {
          union(existing, r.index);
          decisions.push({ fromRecordId: r.record.id, intoPersonId: keyed[existing].record.id, by: 'email', note: `exact email ${r.email}` });
        }
        setMatchedBy(r.record, 'email');
      } else {
        byEmail.set(r.email, r.index);
      }
    }
    if (r.phone) {
      const existing = byPhone.get(r.phone);
      if (existing !== undefined) {
        if (find(existing) !== find(r.index)) {
          union(existing, r.index);
          decisions.push({ fromRecordId: r.record.id, intoPersonId: keyed[existing].record.id, by: 'phone', note: `exact phone ${r.phone}` });
        }
        setMatchedBy(r.record, 'phone');
      } else {
        byPhone.set(r.phone, r.index);
      }
    }
  }

  // ---- Build groups ------------------------------------------------------------
  const groupByRoot = new Map<number, SourceRecord[]>();
  for (const r of keyed) {
    const root = find(r.index);
    if (!groupByRoot.has(root)) groupByRoot.set(root, []);
    groupByRoot.get(root)!.push(r.record);
  }
  let groups: SourceRecord[][] = [...groupByRoot.values()];

  // ---- Pass 2: name + city ------------------------------------------------------
  // Iterate pairs of groups; merge only when the evidence rules pass.
  const tryMerge = (ga: SourceRecord[], gb: SourceRecord[]): { ok: boolean; reason?: string } => {
    const ka = keyRecords(ga);
    const kb = keyRecords(gb);
    const nameA = ka[0].nameKey;
    const nameB = kb[0].nameKey;
    if (nameA !== nameB) return { ok: false, reason: 'name differs' };

    const cityA = ka[0].cityKey;
    const cityB = kb[0].cityKey;
    if (cityA !== cityB) return { ok: false, reason: `city differs (${cityA} vs ${cityB})` };

    const emailsA = new Set(ka.map((r) => r.email).filter(Boolean) as string[]);
    const emailsB = new Set(kb.map((r) => r.email).filter(Boolean) as string[]);
    const phonesA = new Set(ka.map((r) => r.phone).filter(Boolean) as string[]);
    const phonesB = new Set(kb.map((r) => r.phone).filter(Boolean) as string[]);

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

    const canonicalName = pickCanonicalName(sorted.map((r) => r.name));

    // Canonical identifiers come from the normalized keys, not raw record fields.
    const emails = [...new Set(keyRecords(g).map((r) => r.email).filter(Boolean) as string[])];
    const email = pickCanonicalEmail(emails);

    const phones = [...new Set(keyRecords(g).map((r) => r.phone).filter(Boolean) as string[])];
    const phone = phones.length ? phones[0] : null;

    const cities = [...new Set(keyRecords(g).map((r) => r.cityKey).filter(Boolean) as string[])];
    const city = cities.length ? cities[0] : null;

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

/** Prefer a full (non-abbreviated) name; ties broken by length. */
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