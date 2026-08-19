/**
 * Reusable normalization functions.
 *
 * Each function is intentionally small and unit-tested (tests/normalize.test.ts).
 * Matching/entity logic NEVER depends on raw strings — everything goes through here first.
 */

export function normalizeEmail(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  return t;
}

/**
 * Phone -> canonical form: "91" + 10 digits.
 * Strips +, -, spaces, parens, leading 0. Handles:
 *   +919000000254 -> 919000000254
 *   919000000254  -> 919000000254
 *   09000000254   -> 91900000254   (leading zero dropped, 91 prepended)
 *   9000000254    -> 91900000254   (10 digits -> 91 prepended)
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  let d = digits;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length === 12 && d.startsWith('91') ? d : null;
}

/**
 * Normalized name for display and matching: trimmed, whitespace collapsed, title-cased.
 * Lowercases the rest of each word so ALL-CAPS names ("MANISH BHATIA") become "Manish Bhatia",
 * while initials with periods ("R. Verma") keep their dot.
 */
export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, pre: string, c: string) => `${pre}${c.toUpperCase()}`);
}

/**
 * Canonical city mapping. Handles the spelling/case variants found in the CSVs:
 *   Bengaluru/Bangalore/bangalore/bengaluru -> Bengaluru
 *   Gurgaon/GURGAON/gurugram/gurugram      -> Gurugram
 *   Pune/pune/PUNE                          -> Pune
 *   Noida/NOIDA/Noida                       -> Noida
 *   Delhi/new delhi/New Delhi               -> New Delhi
 *   Delhi NCR                               -> Delhi NCR (region label, kept distinct)
 */
const CITY_CANONICAL: Record<string, string> = {
  bengaluru: 'Bengaluru',
  bangalore: 'Bengaluru',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  pune: 'Pune',
  noida: 'Noida',
  'new delhi': 'New Delhi',
  delhi: 'New Delhi',
  'delhi ncr': 'Delhi NCR',
};

export function normalizeCity(raw: string | null | undefined): string | null {
  const key = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  return CITY_CANONICAL[key] ?? null;
}

/**
 * Skills -> lowercased, trimmed, deduped, sorted list.
 * Input can be a comma-separated string (naukri "Python, React" or gig "n8n, langchain, ...").
 */
export function normalizeSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim().toLowerCase();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out.sort();
}

export const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * Date normalization. The naukri file uses 4 formats:
 *   ISO       2026-08-08
 *   DD-MM     24-07-2026
 *   MM/DD     07/13/2026 (first segment > 12 => month-first)
 *   day-name  7 Jul 2026
 *
 * Ambiguity: slash dates where BOTH segments are <= 12 (e.g. 07/03/2026) could be
 * DD-MM or MM/DD. We parse them as MM/DD (the only convention that explains the whole
 * file) and mark them `ambiguous` so the report can surface them.
 */
export function normalizeDate(
  raw: string | null | undefined,
): { iso: string | null; ambiguous: boolean } {
  const t = (raw ?? '').trim();
  if (!t) return { iso: null, ambiguous: false };

  // ISO YYYY-MM-DD
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { iso: toIso(+m[1], +m[2], +m[3]), ambiguous: false };

  // DD-MM-YYYY
  m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return { iso: toIso(+m[3], +m[2], +m[1]), ambiguous: false };

  // MM/DD/YYYY
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const ambiguous = a <= 12 && b <= 12;
    return { iso: toIso(+m[3], a, b), ambiguous };
  }

  // "7 Jul 2026"
  m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const monthIdx = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3));
    if (monthIdx >= 0) return { iso: toIso(+m[3], monthIdx + 1, +m[1]), ambiguous: false };
  }

  return { iso: null, ambiguous: false };
}

function toIso(y: number, mo: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * CTC normalization. Legit values in the file are 6–7 digit integers (e.g. 417964).
 * A number that is decimal or very small looks like an Experience/LPA value that was
 * misplaced, so we keep the number but flag it `malformed` instead of fabricating a CTC.
 */
export function normalizeCtc(raw: string | null | undefined): {
  value: number | null;
  malformed: boolean;
} {
  const t = (raw ?? '').trim();
  if (!t) return { value: null, malformed: false };
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, malformed: true };
  const looksLikeYearsOrLpa = !Number.isInteger(n) || Math.abs(n) < 10000;
  return { value: n, malformed: looksLikeYearsOrLpa };
}

/** gig status -> Active/active/ACTIVE/Inactive/paused -> canonical small set. */
export function normalizeStatus(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'active') return 'active';
  if (t === 'inactive') return 'inactive';
  if (t === 'paused') return 'paused';
  return t;
}

/** cbnexus Verified -> Y/Yes/yes/N/No -> boolean | null. */
export function normalizeVerified(raw: string | null | undefined): boolean | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'y' || t === 'yes') return true;
  if (t === 'n' || t === 'no') return false;
  return null;
}

/** gig rate "1415/hr" | "72k/month" -> { amount, unit } | null. */
export function parseRate(raw: string | null | undefined): {
  amount: number;
  unit: string;
} | null {
  const t = (raw ?? '').trim();
  const m = t.match(/^(\d+)(k)?\/(month|hr)$/i);
  if (!m) return null;
  return { amount: +m[1], unit: m[2] ? `${m[2]}k/month` : m[3].toLowerCase() };
}