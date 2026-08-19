# DATA_ANALYSIS.md

Phase-1 analysis of the three assignment CSVs, performed before any implementation.
Source of truth: the actual files in `data/`.

## 1. Assignment requirements (from the PDF)

| Task | Requirement |
|------|-------------|
| 1 | Merge the 3 CSVs into one clean database. No common ID field exists → entity resolution required. |
| 2 | ONE working n8n/Make/Zapier automation (chosen: n8n LLM skill-tagging workflow). Pure code scores zero. Export the flow JSON. |
| 3 | Mini audio collection app: name + phone + audio upload; extract & store duration, sample rate, bitrate, loudness (dB); second view lists submissions with play button + extracted properties. |
| 4 | Data issues report, specific, with real examples. |
| 5 | Stretch: scalability analysis for 5,000 workers submitting over a weekend. |

## 2. Source schemas & record counts

### source1_naukri_applicants.csv (naukri)
| Column | Notes |
|--------|-------|
| Full Name | |
| Email | |
| Phone | |
| City | |
| Experience (Years) | decimal years |
| Current CTC | integer INR or decimal (some look like years — see issue D) |
| Applied Date | 4 different date formats |
| Skills | comma-separated |

Records: **42** data rows, 0 empty, 0 exact-duplicate lines.

### source2_gig_workers.csv (gig)
| Column | Notes |
|--------|-------|
| email_id | some uppercase |
| worker_name | |
| rate | `NNNN/hr` or `NNk/month` |
| location | |
| status | Active/active/ACTIVE/Inactive/paused |
| skill_tags | comma-separated, lowercase |

Records: **32** lines after header → **31** non-empty (1 completely empty row). **1 column-shifted row** (Isha Chopra duplicate).

### source3_cbnexus_contacts.csv (cbnexus)
| Column | Notes |
|--------|-------|
| Name | some uppercase |
| Phone Number | `9000000NNN`, `9190000NNNN`, `+91-9000000NNN` |
| City | |
| Verified | Y/Yes/yes/N/No |
| Projects Completed | integer |

Records: **31** lines after header → **30** real records (1 embedded duplicate header row).

## 3. Data-quality issues found

### A. Duplicate header row inside cbnexus (row 16)
`Name,Phone Number,City,Verified,Projects Completed` appears again as a data row.
Handling: detect + skip the row, count it in the report.

### B. Completely empty row in gig (row 12)
`,,,,,` — skip + report.

### C. Column-shifted duplicate row in gig (Isha Chopra)
Row: `"react, javascript, mysql",ISHA.CHOPRA95@MAILTEST.EXAMPLE.ORG,Isha Chopra,1406/hr,Pune,active`
The skill string was written into the `email_id` column and every field is shifted one position right.
Handling: rule-based repair — if `email_id` fails email validation but `worker_name` looks like an email, shift fields left one position. The repaired record is a true duplicate of the Isha Chopra row earlier in the same file.

### D. Malformed Current CTC values (naukri)
Most CT C values are 6–7 digit integers (e.g. `417964`, `1195422`), but many are small decimals (`4.2`, `5.8`, `11.2`, `6.1`, `2.4`, `10.0`, `11.9`, `5.1`, `6.6`, `7.8`, `9.3`, `5.9`, `10.3`, `7.6`, `2.7`, `11.4`, `8.3`, `6.1`, `5.8` …). These match the *shape* of the Experience column and look like years or LPA values that were swapped/misplaced. This is ambiguous — a value like `4.2` could legitimately be "4.2 LPA".
Handling: keep the raw value in `SourceRecord.rawData`; store a parsed numeric + a `malformed` flag for values that are (a) non-numeric or (b) decimal/very small; do not silently fabricate a CTC. Document in the report.

### E. Four different date formats (naukri, Applied Date)
- `24-07-2026` (DD-MM-YYYY)
- `2026-08-08` (ISO)
- `7 Jul 2026`, `19 Jul 2026` (day + month-name)
- `07/13/2026`, `08/19/2026` (MM/DD/YYYY — first segment > 12 forces month-first)
- Ambiguous: `07/03/2026`, `08/13/2026`, `08/16/2026`, `08/21/2026`, `08/11/2026`, `07/12/2026` (both readings valid)
Handling: dashes + month-name → DD-MM; slashes → MM/DD (only convention that explains all slash dates); ambiguous slash dates flagged as low-confidence and parsed as MM/DD consistently. Documented in report.

### F. Phone format inconsistencies
`+919000000254`, `919000000254`, `9000000254`, `09000000254`, `+91-9000000254`, `9000000NNN`.
Handling: `normalizePhone()` — strip all non-digits, drop a leading `0`, prepend `91` when the result is 10 digits, keep 12-digit `91…` values. Canonical form: `91` + 10 digits.

### G. Email case inconsistencies (gig)
`ISHA.CHOPRA95@MAILTEST.EXAMPLE.ORG`, `VARUN.SAXENA21@EXAMPLE.IN`, `DEEPAK.NAIR44@EXAMPLE.COM`, `NEHA.BHATIA60@MAILTEST.EXAMPLE.ORG`, `KARAN.CHOPRA76@…`, etc.
Handling: lowercase + trim in `normalizeEmail()`.

### H. Name inconsistencies
- `R. Verma` vs `Rohit Verma` (same email + phone → same person, name is an abbreviation).
- `alt.nikhil.chopra70@example.com` vs `nikhil.chopra70@example.com` (same phone; "alt." prefix is a formatting anomaly, not a different person).
- All-caps names in cbnexus (`RITU SHARMA`, `RAHUL MALHOTRA`).
Handling: title-case normalization for display; identity resolved by strong identifiers (email/phone), never by name formatting alone.

### I. City inconsistencies
- `Bengaluru` / `Bangalore` / `bangalore` / `bengaluru`
- `Gurgaon` / `GURGAON` / `gurugram` / `gurugram `
- `Pune` / `pune` / `PUNE`
- `Noida` / `NOIDA` / `Noida `
- `Delhi` / `new delhi` / `New Delhi` / `Delhi NCR`
Handling: `normalizeCity()` maps variants to a canonical city. `Delhi NCR` kept distinct from `New Delhi` (it is a region label, not a city).

### J. Skill inconsistencies
- Case: `REST APIs` vs `rest apis`, `Python` vs `python`.
- Within-source variation: same person in naukri and gig lists slightly different skill sets.
- Two *different* people named **Arjun Mehta** (Noida) have completely disjoint skills — used as a distinguishing signal.
Handling: `normalizeSkills()` → lowercase, trim, dedupe, sort. Skill overlap used as evidence in entity resolution.

### K. Status / Verified inconsistencies
- gig status: `Active`/`active`/`ACTIVE`/`Inactive`/`paused`.
- cbnexus Verified: `Y`/`Yes`/`yes`/`N`/`No`.
Handling: normalize to a small set of values (`active`/`inactive`/`paused`; `verified` boolean).

### L. Two different people share a full name in the same city
- **Arjun Mehta**, Noida: naukri (phone …131, skills `SQL, Selenium, n8n`) + cbnexus (phone …131) are ONE person; gig (email …mehta77, skills `fastapi, pandas, web scraping, zapier, docker, mysql`) + cbnexus (phone …272) are a SECOND person.
- **Deepak Nair**: naukri/gig(cbnexus) `…44` + Bengaluru is one person; gig `…57` in New Delhi is a different person.
These are the exact false-positive traps in the data.

## 4. Cross-source duplicate candidates (verified)

**By email (16 matches):** Tanvi Gupta, Vikram Saxena, Isha Chopra, Karan Bhatia, Arjun Mishra, Meera Bhatia, Varun Jain, Sneha Chopra, Varun Saxena, Gaurav Mehta, Deepak Nair (…44), Rahul Chopra, Tanvi Agarwal, Isha Kapoor, Neha Bhatia + naukri-internal R.Verma/Rohit Verma.

**By phone (27 matches):** Tanvi Gupta, Priya Singh, Vikram Saxena, Sahil Malhotra, Shreya Gupta, Isha Chopra, Rahul Malhotra, Karan Bhatia, Ritu Sharma, Arjun Mishra, Meera Bhatia, Varun Jain, Arjun Mehta (…131), Sneha Chopra, Deepak Mehta, Priya Saxena, Varun Saxena, Gaurav Mehta, Rohit Nair, Deepak Nair (…296), Rahul Chopra, Tanvi Agarwal, Nikhil Mehta, Isha Kapoor, Neha Bhatia + naukri-internal R.Verma/Rohit Verma + naukri-internal Nikhil Chopra (alt./normal).

**Name+city (gig↔cbnexus only, no shared identifiers):** Manish Bhatia (Noida), Divya Chopra (Noida), Karan Chopra (Pune), Vikram Mehta (Pune), Arjun Mehta #2 (Noida).

**Rejected by evidence:** Arjun Mehta gig↔Arjun Mehta #1 (disjoint skills, different phones); Deepak Nair gig `…57` (different city).

## 5. Proposed canonical schema

```text
Person
- id, canonicalName, email (canonical), phone (canonical), city (canonical)
- experienceYears, currentCtc (numeric), ctcMalformed (bool)
- createdAt, updatedAt

SourceRecord
- id, personId (FK)
- source (naukri|gig|cbnexus), sourceRow
- rawData (JSON), matchedBy (email|phone|name_city|none)
- createdAt

Skill
- id, name (normalized), category hint

PersonSkill          (join Person ↔ Skill)
- personId, skillId, source

AudioSubmission
- id, personId (FK, nullable until person lookup)
- filePath, originalFilename, mimeType, sizeBytes
- durationSeconds, sampleRateHz, bitrateKbps, loudnessDb
- noiseScore, qualityScore (bonus)
- createdAt

SkillClassification   (n8n writes here)
- id, personId, category, confidence, reason, source (n8n)
- createdAt
```

## 6. Entity resolution strategy

Tiered, explainable, conservative (avoid false positives):

1. **Exact normalized email** → same person (very high confidence).
2. **Exact normalized phone** → same person (very high confidence).
3. **Normalized name + normalized city** → same person only when:
   - no shared identifier already links the records to different people, AND
   - when both records have non-empty skill sets, the skill sets must not be disjoint (a disjoint, non-empty overlap is treated as *conflicting evidence* → no merge).
4. Everything else → keep separate.

Rationale: the two Arjun Mehtas and two Deepak Nairs demonstrate that name+city alone is not reliable; the disjoint-skill rule is exactly what separates the planted same-name pairs.

## 7. Expected ingestion summary (to be verified by the script)

```
Naukri records:           42
Gig worker records:       31
CBNexus records:          30
Total source records:     103
Unique people:            55
Duplicate records merged: 48
Potential conflicts:      2 (Arjun Mehta pair, Deepak Nair pair)
Unmatched records:        0
```

## 8. Task decisions

- **Stack:** Node.js + TypeScript + Fastify + Prisma + PostgreSQL (local Homebrew Postgres; Docker unavailable on this machine). React + Vite + Tailwind for the web UI. ffmpeg/ffprobe for audio metadata.
- **n8n:** locally installed; workflow = schedule/manual trigger → read people from Postgres → LLM (OpenAI-compatible endpoint, configurable; a local mock endpoint is provided for keyless demos) → validate JSON → write SkillClassification back to Postgres.
- **Audio app:** browser file upload (recording optional). Metadata extracted server-side with ffprobe (duration/sample rate/bitrate) + ffmpeg `ebur128` filter (integrated loudness LUFS). Noise score derived from signal statistics as a documented heuristic (bonus).
- **Scalability:** docs/scalability.md (design exercise, no infra built).