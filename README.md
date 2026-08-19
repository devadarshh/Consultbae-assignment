# ConsultBae AI Automation — Take-Home Assignment

Three deliverables for the ConsultBae technical assignment, built as one Node.js/TypeScript repo:

1. **Task 1 — 3-CSV merge** into a canonical PostgreSQL database with a data-quality report.
2. **Task 2 — n8n automation** that LLM-categorizes each candidate's skills (Gemini via OpenAI-compatible API) and writes classifications back to Postgres.
3. **Task 3 — mini audio collection app** (Fastify API + React UI) that extracts FFmpeg audio metadata on upload and lists submissions with a built-in player.

Plus: `docs/data-quality-report.md`, `docs/scalability.md` (5,000 workers in a weekend), and `STUCK_LOG.md`.

## Tech stack

Node 22 · TypeScript 5 · Fastify 5 · Prisma 5 · PostgreSQL 13 · React 18 + Vite 6 + Tailwind 3 · n8n 2.8 · fluent-ffmpeg · Vitest 2 · Zod 3.25

## Project layout

```
apps/api/        Fastify API (audio upload + metadata, people, health)
apps/web/        React UI (submit + submissions views)
packages/shared/ CSV parser, normalization, entity resolution, audio metadata
prisma/          schema + migration
scripts/         inspect-data, test-resolution, ingest, generate-test-audio
tests/           unit + integration tests (40 passing)
n8n/             skill-categorization workflow JSON + credential template
docs/            data-quality-report.md, scalability.md
data/            the three source CSVs
uploads/         uploaded audio (local, git-ignored)
```

## Prerequisites

- Node ≥ 20, npm
- PostgreSQL running locally (Homebrew: `brew services start postgresql@13`)
- `ffmpeg` / `ffprobe` on PATH
- A Gemini API key (free tier works) — **must be pasted into `.env` as `GEMINI_API_KEY`**

## Quick start

```bash
npm install

# 1. Database
createdb consultbae                       # or create via psql
npm run migrate                           # prisma migrate dev

# 2. Ingest + merge the CSVs (idempotent)
npm run ingest

# 3. Inspect / verify
npm run inspect                           # raw data inspection
npm run test:resolution                   # entity-resolution dry run
npm test                                  # 40 tests

# 4. Run the app
npm run api                               # http://localhost:3001
npm run web                               # http://localhost:5173 (proxies /api)

# 5. n8n automation
npm run n8n                               # http://localhost:5678
```

> `npm run migrate` uses `DATABASE_URL` from `.env` (see `.env.example`).

## Task 1 — 3-CSV merge

- `packages/shared/src/sources.ts` parses each file with per-source cleaning (embedded header row, empty row, column-shifted duplicate).
- `packages/shared/src/normalize.ts` canonicalizes email, phone (`91` + 10 digits), name, city, dates, CTC, and skills.
- `packages/shared/src/entity-resolution.ts` resolves duplicates by: exact email → exact phone → name+city (only when no conflicting identifiers and skill sets are not disjoint).
- `scripts/ingest.ts` loads everything into Prisma models `Person`, `SourceRecord`, `Skill`, `PersonSkill`.

**Result:** 103 source records → **55 unique people**, 48 merges, 3 rejected conflict pairs, 0 unmatched. The two same-name traps (Arjun Mehta, Deepak Nair) are kept separate on purpose and flagged — see `docs/data-quality-report.md`.

## Task 2 — n8n skill-categorization automation

`n8n/skill-categorization.json` runs weekly (Mon 09:00, also manual trigger):

1. **Postgres** — read all people *without* an existing `n8n` classification.
2. **HTTP Request** — one call to Gemini's OpenAI-compatible endpoint (`gemini-3.6-flash`) asking for a JSON array of `{ id, category, confidence, reason }`; the API key is read from `$env.GEMINI_API_KEY`.
3. **Code (Parse & validate)** — parse JSON, whitelist the category, clamp confidence, escape the reason.
4. **Postgres** — `INSERT … ON CONFLICT (personId, source) DO UPDATE`, so re-runs are idempotent.

### Import & run

```bash
npm run n8n                     # start n8n (reads .env, allows $env in nodes)
# in n8n UI: Credentials → import n8n/credentials.postgres.json (or create a
# Postgres credential and re-select it on the two Postgres nodes), then
# Workflows → import n8n/skill-categorization.json, open it, and "Execute workflow".
```

The workflow uses `$env.GEMINI_API_KEY`, so the only setup is pasting your key in `.env`. If n8n runs elsewhere, set the same env var there. The current model is `gemini-3.6-flash` (`gemini-2.0-flash` was retired by Google).

## Task 3 — Audio collection app

`POST /api/audio-submissions` (multipart: `name`, `phone`, `audio`) validates the upload (ext, size, MIME sniff), runs `ffprobe` via `fluent-ffmpeg` to extract **duration, sample rate, bitrate, loudness (EBU-R128 LUFS)** (plus noise/quality scores as a bonus), links the submitter to the merged `Person` by normalized phone, and streams the file back at `GET /api/audio-submissions/:id/file`.

The React app (`apps/web`) has two views: **Submit Audio** and **Submissions** (metadata table + `<audio>` player).

```bash
npm run api    # API on :3001
npm run web    # UI on :5173
```

Generate a test file if you like: `npm run ffmpeg:generate-test-audio` (writes `tests/fixtures/test-tone.wav`).

## Tests

```bash
npm test        # vitest run — 40 tests (normalize, entity resolution, audio extraction)
npm run typecheck
```

## Docs

- `docs/data-quality-report.md` — issues found per source and how each was handled.
- `docs/scalability.md` — architecture to reach 5,000 workers in a weekend.
- `docs/DATA_ANALYSIS.md` (repo root) — the full Phase-1 source analysis.
- `STUCK_LOG.md` — real blockers and fixes.

## Notes

- **Gemini free tier** is throttled (≈5–20 req/min). The workflow is batch-shaped (one request per run) and idempotent, so re-runs resume safely; for sustained volume use a paid key (see `docs/scalability.md`).
- Audio files are stored under `uploads/` locally; the scalability doc moves them to object storage for production.
