/**
 * Per-source parsing + cleaning.
 *
 * Each source has its own quirks that must be handled BEFORE entity resolution:
 *  - naukri  : date formats, malformed CTC, abbreviation in names
 *  - gig     : one completely empty row, one column-shifted row (Isha Chopra)
 *  - cbnexus : one embedded duplicate header row, Y/yes/N/No verified values
 */
import { parseCsv } from './csv';
import {
  normalizeCity,
  normalizeCtc,
  normalizeDate,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSkills,
  normalizeStatus,
  normalizeVerified,
  parseRate,
} from './normalize';
import type { CleanedSource, CleanIssue, SourceRecord } from './types';

function isEmailLike(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
}

let idCounter = 1;
function nextId(): number {
  return idCounter++;
}

export function parseNaukri(text: string): CleanedSource {
  const rows = parseCsv(text);
  const issues: CleanIssue[] = [];
  const records: SourceRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const [fullName, email, phone, city, exp, ctc, appliedDate, skills] = row;

    const normalized = normalizeName(fullName);
    const { iso, ambiguous } = normalizeDate(appliedDate);
    const c = normalizeCtc(ctc);
    const expYears = exp.trim() === '' ? null : Number(exp);

    records.push({
      id: nextId(),
      source: 'naukri',
      sourceRow: i,
      name: normalized,
      email: normalizeEmail(email),
      phone: normalizePhone(phone),
      city: normalizeCity(city),
      skills: normalizeSkills(skills),
      experienceYears: Number.isFinite(expYears ?? NaN) ? expYears : null,
      ctc: c.value,
      ctcMalformed: c.malformed,
      appliedDateIso: iso,
      dateAmbiguous: ambiguous,
      rate: null,
      status: null,
      verified: null,
      projectsCompleted: null,
      rawData: { 'Full Name': fullName, Email: email, Phone: phone, City: city, 'Experience (Years)': exp, 'Current CTC': ctc, 'Applied Date': appliedDate, Skills: skills },
      matchedBy: 'unique',
    });

    if (c.malformed && c.value !== null) {
      issues.push({ row: i, type: 'ctc-format', detail: `CTC "${ctc}" looks like a years/LPA value, not an INR integer`, resolved: true });
    }
    if (ambiguous) {
      issues.push({ row: i, type: 'ambiguous-date', detail: `Applied Date "${appliedDate}" is ambiguous (DD-MM vs MM/DD); parsed as MM/DD`, resolved: true });
    }
    if (/^[A-Z]\.\s/.test(fullName.trim())) {
      issues.push({ row: i, type: 'abbreviated-name', detail: `Name "${fullName}" is abbreviated; identity resolved via email/phone`, resolved: true });
    }
    if (/^alt\./i.test(email.trim())) {
      issues.push({ row: i, type: 'email-prefix', detail: `Email "${email}" has an "alt." prefix; same person via matching phone`, resolved: true });
    }
  }

  return { source: 'naukri', records, issues };
}

export function parseGig(text: string): CleanedSource {
  const rows = parseCsv(text);
  const issues: CleanIssue[] = [];
  const records: SourceRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Empty row (",,,,,,")
    if (row.every((c) => c.trim() === '')) {
      issues.push({ row: i, type: 'empty-row', detail: 'Completely empty row', resolved: true });
      continue;
    }

    // Column-shifted row: skill string landed in email_id and everything moved one right.
    let [emailRaw, nameRaw, rateRaw, locRaw, statusRaw, skillsRaw] = row;
    if (!isEmailLike(emailRaw) && isEmailLike(nameRaw)) {
      issues.push({
        row: i,
        type: 'column-shift',
        detail: `Row is shifted one column right: skill_tags "${emailRaw}" in email_id, email "${nameRaw}" in worker_name. Repaired by shifting left.`,
        resolved: true,
      });
      [emailRaw, nameRaw, rateRaw, locRaw, statusRaw, skillsRaw] = [
        nameRaw, rateRaw, locRaw, statusRaw, skillsRaw, emailRaw,
      ];
    }

    records.push({
      id: nextId(),
      source: 'gig',
      sourceRow: i,
      name: normalizeName(nameRaw),
      email: normalizeEmail(emailRaw),
      phone: null, // gig has no phone column
      city: normalizeCity(locRaw),
      skills: normalizeSkills(skillsRaw),
      experienceYears: null,
      ctc: null,
      ctcMalformed: false,
      appliedDateIso: null,
      dateAmbiguous: false,
      rate: parseRate(rateRaw),
      status: normalizeStatus(statusRaw),
      verified: null,
      projectsCompleted: null,
      rawData: { email_id: emailRaw, worker_name: nameRaw, rate: rateRaw, location: locRaw, status: statusRaw, skill_tags: skillsRaw },
      matchedBy: 'unique',
    });

    if (!isEmailLike(emailRaw)) {
      issues.push({ row: i, type: 'email-format', detail: `email_id "${emailRaw}" is not a valid email`, resolved: true });
    }
  }

  return { source: 'gig', records, issues };
}

export function parseCbnexus(text: string): CleanedSource {
  const rows = parseCsv(text);
  const issues: CleanIssue[] = [];
  const records: SourceRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const [nameRaw, phoneRaw, cityRaw, verifiedRaw, projectsRaw] = row;

    // Embedded duplicate header row
    if (nameRaw.trim() === 'Name' && phoneRaw.trim() === 'Phone Number') {
      issues.push({ row: i, type: 'duplicate-header', detail: 'Row repeats the header row mid-file; skipped', resolved: true });
      continue;
    }

    const projects = projectsRaw.trim() === '' ? null : Number(projectsRaw);
    const normalizedPhone = normalizePhone(phoneRaw);
    if (!normalizedPhone) {
      issues.push({ row: i, type: 'phone-format', detail: `Phone "${phoneRaw}" could not be normalized`, resolved: false });
    }

    records.push({
      id: nextId(),
      source: 'cbnexus',
      sourceRow: i,
      name: normalizeName(nameRaw),
      email: null, // cbnexus has no email column
      phone: normalizedPhone,
      city: normalizeCity(cityRaw),
      skills: [],
      experienceYears: null,
      ctc: null,
      ctcMalformed: false,
      appliedDateIso: null,
      dateAmbiguous: false,
      rate: null,
      status: null,
      verified: normalizeVerified(verifiedRaw),
      projectsCompleted: Number.isFinite(projects ?? NaN) ? projects : null,
      rawData: { Name: nameRaw, 'Phone Number': phoneRaw, City: cityRaw, Verified: verifiedRaw, 'Projects Completed': projectsRaw },
      matchedBy: 'unique',
    });
  }

  return { source: 'cbnexus', records, issues };
}