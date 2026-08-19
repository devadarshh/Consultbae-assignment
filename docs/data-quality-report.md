# Data Quality Report — ConsultBae 3-CSV merge

## 1. Input sources

| File | Records | Columns |
|------|---------|---------|
| `data/source1_naukri_applicants.csv` | 42 | Full Name, Email, Phone, City, Experience (Years), Current CTC, Applied Date, Skills |
| `data/source2_gig_workers.csv` | 31 usable (32 lines, 1 fully empty) | email_id, worker_name, rate, location, status, skill_tags |
| `data/source3_cbnexus_contacts.csv` | 30 (31 lines, 1 embedded duplicate header) | Name, Phone Number, City, Verified, Projects Completed |

**Total source records: 103.**

## 2. Issues found and how they were handled

### A. Duplicate header row embedded in CBNexus data (source 3)
The header `Name,Phone Number,City,Verified,Projects Completed` appears again as a data row.
**Handling:** the parser detects a row whose values exactly match the header and drops it. Applied before any further cleaning.

### B. Fully empty row in gig data (source 2)
One line is `,,,,,` — all fields empty.
**Handling:** skipped during parse.

### C. Column-shifted duplicate row in gig data (source 2)
Isha Chopra appears twice; in the second occurrence the skill string was written into the `email_id` column and every field is shifted one position right (each cell holds the previous column's value).
**Handling:** rule-based repair — if `email_id` fails email validation but `worker_name` *looks like* an email, shift all fields one position left. The repaired record is a true duplicate of the earlier Isha Chopra row and merges with it.

### D. Malformed `Current CTC` values (source 1)
Most values are 6–7 digit integers (e.g. `417964`, `1195422`), but many are small decimals that look like *years of experience* swapped into the CTC column (`4.2`, `5.8`, `11.2`, `6.1`, `2.4`, `10.0`, …). A value like `4.2` could legitimately be "4.2 LPA", so this is ambiguous.
**Handling:** the raw value is preserved in `SourceRecord.rawData`; a parsed numeric plus a `ctcMalformed` flag is stored for values that are non-numeric or decimal/very small. No CTC is silently fabricated — the flag makes the anomaly queryable.

### E. Inconsistent date formats (source 1)
Four formats coexist: ISO (`2026-07-07`), DD-MM-YYYY, MM/DD/YYYY, and month-name (`7 Jul 2026`).
**Handling:** dashes + month-name → day-month; slashes → month/day (the only convention consistent across the slash dates); slash dates whose order is ambiguous (day ≤ 12) are flagged low-confidence and parsed as month/day for consistency. All dates stored as canonical `YYYY-MM-DD`.

### F. Phone format inconsistencies (all sources)
Formats seen: `9000000NNN`, `9190000NNNN`, `+91-9000000NNN`, `+9190000NNNN`, `091900000NNN`.
**Handling:** `normalizePhone()` strips non-digits, drops a leading `0`, prepends `91` when left with 10 digits, keeps 12-digit `91…` values. Canonical form: `91` + 10 digits. Invalid/non-Indian numbers are rejected or left `null` with a flag.

### G. Email case inconsistencies (source 2)
Emails appear mixed-case (`Tanvi.Gupta@EXAMPLE.com`).
**Handling:** lowercased + trimmed. Also the `alt.` prefix anomaly — `alt.nikhil.chopra70@example.com` vs `nikhil.chopra70@example.com` share a phone and are resolved to the same person by phone (see §4).

### H. Name case + abbreviation variants
Names are ALL-CAPS in one source, title-case in another, and one applicant is abbreviated (`R. Verma` vs `Rohit Verma`).
**Handling:** names are normalized to title-case for display only; identity is resolved from strong identifiers (email / phone), never from name formatting. The full name (`Rohit Verma`) is preferred over the abbreviation.

### I. City variants
`Noida` / `noida`, `Bengaluru` / `bangalore`, and `Delhi NCR` (region label, kept distinct from `New Delhi`).
**Handling:** `normalizeCity()` maps known variants to a canonical city; unknown values are stored as-is.

### J. Skill string hygiene
Skill columns use different separators, mixed case, and duplicates.
**Handling:** `normalizeSkills()` → lowercase, trimmed, de-duplicated, sorted. Skill overlap is used as *evidence* during entity resolution (see §4).

## 3. Normalization summary

| Field | Canonical form | Function |
|-------|----------------|----------|
| Email | lowercase, trimmed | `normalizeEmail` |
| Phone | `91` + 10 digits | `normalizePhone` |
| Name | title-case | `normalizeName` |
| City | canonical city name | `normalizeCity` |
| Date | `YYYY-MM-DD` | `normalizeDate` |
| CTC | numeric + `malformed` flag | `normalizeCtc` |
| Skills | lowercase, sorted, deduped | `normalizeSkills` |

All rules live in `packages/shared/src/normalize.ts` and are unit-tested (`tests/normalize.test.ts`, 24 cases).

## 4. Entity resolution outcome

Resolution keys, in order of confidence:

1. **Exact normalized email** → same person.
2. **Exact normalized phone** → same person.
3. **Name + city** → only when neither record already carries a conflicting identifier (e.g. two *different* phones across the groups) and, when both have non-empty skill sets, the skill sets are **not** disjoint (a disjoint non-empty overlap is treated as conflicting evidence → no merge).

| Outcome | Count |
|---------|-------|
| Source records | 103 |
| Unique people after resolution | **55** |
| Merge decisions applied | **48** |
| Rejected merge pairs (conflicting evidence) | **3** |
| Unmatched records | 0 |

### Rejected pairs (the tricky cases)
- **Arjun Mehta #1** (Noida, phone `…131`, skills `SQL, Selenium, n8n`) vs gig **Arjun Mehta** (email `…mehta77`, skills `fastapi, pandas, web scraping, zapier, docker, mysql`): same name, but two different emails/phones and *disjoint* skill sets → treated as two distinct people.
- **Arjun Mehta #2** (CBNexus phone `…272`) vs **Arjun Mehta #1** (phone `…131`): same name + city, but different phones → not merged (the two existing clusters stay separate).
- **Deepak Nair** (Bengaluru, phone `…296`) vs gig **Deepak Nair** (email `…nair57`, city New Delhi): name matches but cities conflict and identifiers are disjoint → not merged.

These are deliberately conservative: when the data genuinely supports "two people, same name", the pipeline keeps them separate and flags them for manual review instead of silently corrupting the directory.

## 5. Verification
- `npm run ingest` is idempotent (wipes and reloads) and prints a per-source summary.
- DB counts after ingest: `Person` = 55, `SourceRecord` = 103, `Skill` = 15, `PersonSkill` = 257.
- `scripts/test-resolution.ts` reproduces resolution decisions headlessly.
