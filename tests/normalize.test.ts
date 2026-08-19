import { describe, expect, it } from 'vitest';
import {
  normalizeCity,
  normalizeDate,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSkills,
} from '../packages/shared/src/normalize';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  John@Example.COM ')).toBe('john@example.com');
    expect(normalizeEmail('ISHA.CHOPRA95@MAILTEST.EXAMPLE.ORG')).toBe('isha.chopra95@mailtest.example.org');
  });
  it('returns null for empty input', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('strips +91 prefix', () => {
    expect(normalizePhone('+919000000254')).toBe('919000000254');
  });
  it('keeps 12-digit 91-prefixed numbers', () => {
    expect(normalizePhone('919000000254')).toBe('919000000254');
  });
  it('drops leading zero and prepends 91', () => {
    expect(normalizePhone('09000000254')).toBe('919000000254');
  });
  it('prepends 91 to 10-digit numbers', () => {
    expect(normalizePhone('9000000254')).toBe('919000000254');
  });
  it('strips hyphens, spaces and parens', () => {
    expect(normalizePhone('+91-9000000 254')).toBe('919000000254');
    expect(normalizePhone('(91) 9000000254')).toBe('919000000254');
  });
  it('rejects non-Indian phone shapes', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(normalizePhone('')).toBeNull();
  });
});

describe('normalizeName', () => {
  it('title-cases and collapses whitespace', () => {
    expect(normalizeName('  ROHIT  VERMA ')).toBe('Rohit Verma');
    expect(normalizeName('MANISH BHATIA')).toBe('Manish Bhatia');
  });
  it('keeps abbreviated initial with period', () => {
    expect(normalizeName('R. Verma')).toBe('R. Verma');
  });
});

describe('normalizeCity', () => {
  it('maps Bangalore variants to Bengaluru', () => {
    expect(normalizeCity('Bangalore')).toBe('Bengaluru');
    expect(normalizeCity('bangalore')).toBe('Bengaluru');
    expect(normalizeCity('Bengaluru')).toBe('Bengaluru');
  });
  it('maps Gurgaon variants to Gurugram', () => {
    expect(normalizeCity('GURGAON')).toBe('Gurugram');
    expect(normalizeCity('gurugram ')).toBe('Gurugram');
  });
  it('maps Delhi variants to New Delhi but keeps Delhi NCR distinct', () => {
    expect(normalizeCity('Delhi')).toBe('New Delhi');
    expect(normalizeCity('new delhi')).toBe('New Delhi');
    expect(normalizeCity('Delhi NCR')).toBe('Delhi NCR');
  });
  it('trims whitespace around Noida/Pune', () => {
    expect(normalizeCity(' Noida ')).toBe('Noida');
    expect(normalizeCity('PUNE')).toBe('Pune');
    expect(normalizeCity('pune')).toBe('Pune');
  });
});

describe('normalizeSkills', () => {
  it('lowercases, trims, dedupes and sorts', () => {
    expect(normalizeSkills('React, Zapier, n8n, MySQL, Python, SQL')).toEqual(['mysql', 'n8n', 'python', 'react', 'sql', 'zapier']);
    expect(normalizeSkills('n8n, langchain, rest apis, mongodb, sql')).toEqual(['langchain', 'mongodb', 'n8n', 'rest apis', 'sql']);
  });
  it('dedupes duplicates', () => {
    expect(normalizeSkills('Python, PYTHON, python')).toEqual(['python']);
  });
  it('returns empty array for empty input', () => {
    expect(normalizeSkills('')).toEqual([]);
    expect(normalizeSkills(undefined)).toEqual([]);
  });
});

describe('normalizeDate', () => {
  it('parses ISO format', () => {
    expect(normalizeDate('2026-08-08').iso).toBe('2026-08-08');
    expect(normalizeDate('2026-08-08').ambiguous).toBe(false);
  });
  it('parses DD-MM-YYYY as day-first', () => {
    expect(normalizeDate('24-07-2026').iso).toBe('2026-07-24');
  });
  it('parses MM/DD/YYYY when first segment > 12', () => {
    expect(normalizeDate('07/13/2026').iso).toBe('2026-07-13');
  });
  it('flags ambiguous slash dates', () => {
    const d = normalizeDate('07/03/2026');
    expect(d.iso).toBe('2026-07-03');
    expect(d.ambiguous).toBe(true);
  });
  it('parses day-month-name format', () => {
    expect(normalizeDate('7 Jul 2026').iso).toBe('2026-07-07');
    expect(normalizeDate('19 Jul 2026').iso).toBe('2026-07-19');
  });
  it('returns null for unparseable input', () => {
    expect(normalizeDate('not a date').iso).toBeNull();
    expect(normalizeDate('').iso).toBeNull();
  });
});