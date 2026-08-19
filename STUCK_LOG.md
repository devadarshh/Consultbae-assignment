# STUCK_LOG — real problems hit and how they were unblocked

A running log of the actual blockers encountered while building this project. Kept short; each entry = symptom → cause → fix.

### 1. PDF unreadable on macOS
- **Symptom:** the assignment PDF couldn't be text-extracted with available tools (no Poppler `pdftotext`).
- **Fix:** created a throwaway venv (`/tmp/.../pdfenv`) and used `pypdf` to dump the text. Analysis went into `DATA_ANALYSIS.md`.

### 2. npm `allow-scripts` silently skipped build scripts
- **Symptom:** `prisma generate` / esbuild postinstall never ran → CLI and client broke.
- **Fix:** `npm install-scripts approve <pkg>` for `prisma`, `@prisma/client`, `@prisma/engines`, `esbuild`.

### 3. `require` in an ESM package
- **Symptom:** `ReferenceError: require is not defined` in the CSV reader.
- **Fix:** rewrote with `node:fs` + a hand-rolled RFC-4180 parser (no dependency).

### 4. Union-find indexed by record `id` instead of position
- **Symptom:** wrong merges and array index bugs in entity resolution.
- **Fix:** keyed the union-find on positional indices and kept separate `keyRecords` for canonical fields.

### 5. Duplicate `PersonSkill` rows blew up the ingest transaction
- **Symptom:** `$transaction` failed on a unique constraint when the same normalized skill appeared twice for one person.
- **Fix:** dedupe skills per person before inserting.

### 6. Sequence reset hit a table without an `id` column
- **Symptom:** `setval(pg_get_serial_sequence('PersonSkill', 'id'))` → `column "id" does not exist`.
- **Fix:** skip composite-key tables in the reset loop.

### 7. `@fastify/multipart` v8 requires Fastify 4
- **Symptom:** boot error `expected '4.x' fastify version, '5.12.1' is installed`.
- **Fix:** upgraded to `@fastify/multipart@^9`.

### 8. Fastify 5 `setErrorHandler` types the error as `unknown`
- **Symptom:** TS18046 on `err.statusCode`/`err.code`.
- **Fix:** narrow via a local `as { statusCode?: number; code?: string; validation?: unknown }`.

### 9. Multipart field union typing
- **Symptom:** `data.fields.name.value` — `Multipart | Multipart[]` union has no `.value` on the file branch.
- **Fix:** `fieldValue()` helper that handles arrays and the `value` branch.

### 10. FFmpeg loudness regex captured per-frame progress lines
- **Symptom:** loudness always `-70.0 LUFS` (per-frame `I:` lines) instead of the summary `-21.8`.
- **Fix:** anchor to the summary line: `/^\s*I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/m`.

### 11. Zod version collision crashed n8n at boot
- **Symptom:** `Error: A discriminator value for key '__type' could not be extracted` in `@n8n/api-types`.
- **Cause:** n8n pins `zod@3.25.67`; our `^3.23.8` resolved to `3.25.76` → two zod copies mixed schemas.
- **Fix:** pinned our `zod` to exactly `3.25.67`; `npm install` deduped to a single copy.

### 12. "Loop Over Items" node doesn't exist in n8n 2.8
- **Symptom:** `Unrecognized node type: n8n-nodes-base.loopOverItems`.
- **Fix:** the node is now `splitInBatches` v3 ("Loop Over Items (Split in Batches)").

### 13. Loops/batching don't re-enter under `n8n execute` (CLI)
- **Symptom:** only the *first* batch's downstream nodes ran; subsequent batches were dropped (SplitInBatches v3 and HTTP "batching" both).
- **Fix:** redesigned the workflow as a **single batch request**: read all unclassified people → one LLM call returning a JSON array → parse → one insert per person. No loop node needed; also avoids per-request LLM rate limits.

### 14. Person context lost through the HTTP node
- **Symptom:** `personId` was `undefined` in the write step — the HTTP response body is the only thing that flows downstream.
- **Fix:** the prompt asks Gemini to echo each candidate's `id`, and the Parse node maps `id → classification`.

### 15. Gemini model retired mid-project
- **Symptom:** `404 model models/gemini-2.0-flash is no longer available`.
- **Fix:** switched to `gemini-3.6-flash` (the API's suggested replacement) in config, `.env`, and the workflow.

### 16. Gemini free-tier rate limits
- **Symptom:** `Quota exceeded for metric: generate_content_free_tier_requests, limit: 5…` during rapid test runs.
- **Fix:** batch design = one request per workflow run; spaced retries between verification runs. Documented pacing in `docs/scalability.md`.

### 17. n8n blocks `$env` in expressions
- **Symptom:** `ExpressionError: access to env vars denied`.
- **Fix:** set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` for the n8n process (in `npm run n8n`).

### 18. `n8n import:credentials` requires an `id`
- **Symptom:** `SQLITE_CONSTRAINT: NOT NULL constraint failed: credentials_entity.id`.
- **Fix:** added a stable `id` to the credentials JSON.

### 19. Postgres credential `ssl` must be a string
- **Symptom:** `The server does not support SSL connections`.
- **Fix:** `"ssl": "disable"` (it's a dropdown value, not a boolean).

### 20. Re-importing workflows accumulates stale copies
- **Symptom:** "Destination node not found" — the DB still held an old copy whose connection referenced the old loop node name.
- **Fix:** `DELETE FROM workflow_entity` before each `import:workflow`; never assume import updates in place.

### 21. CLI `execute` collides with a running n8n instance
- **Symptom:** `n8n Task Broker's port 5679 is already in use`.
- **Fix:** stop the server instance before running `npx n8n execute` (they share the task broker port).
