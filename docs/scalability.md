# Scalability Analysis — 5,000 gig workers in a weekend

## 1. Workload profile

The assignment runs three workloads against the same people directory:

1. **Ingest & merge** — parse 3 CSVs (≈ 103 rows here; at scale, still small), normalize, resolve duplicates, write to PostgreSQL.
2. **Audio submissions** — each worker uploads a recording; the API runs FFmpeg to extract duration, sample rate, bitrate, and loudness, then serves the file back with a player.
3. **n8n skill categorization** — an LLM classifies each worker's skills and writes `SkillClassification` rows.

"5,000 workers in a weekend" (≈ 48 hours) is a burst: ~2–3 submissions/sec average, with spiky upload traffic at event start. The merge and LLM classification are *batch* workloads; the audio pipeline is *interactive*.

## 2. Current single-node design and its bottlenecks

| Component | Current | Bottleneck at 5,000 |
|-----------|---------|---------------------|
| API (Fastify) | one process, one machine | CPU is idle; not the limit |
| Audio uploads | written to `uploads/` local disk | local disk fills, no redundancy, single point of failure |
| FFmpeg | run inline in the request handler | **blocking** the request thread for seconds; the real limit |
| PostgreSQL | single instance, Homebrew | fine for 5,000 rows; connection count and WAL become issues at higher rates |
| n8n | single instance, CLI/editor run | fine for 55; per-request LLM throttling is the constraint |
| Gemini | free tier (~5–20 req/min) | **hard blocker**: 5,000 classifications at 20 req/min ≈ 4+ hours at best, and only if the provider keeps pace |

## 3. Target architecture

```
                ┌──────────────┐   PUT/GET /api/audio-submissions
 Uploaders ───► │  ALB / LB    │ ─────────────────────────────────┐
                └──────┬───────┘                                  ▼
                       │                                   ┌──────────────┐
                       ▼                                   │ API workers  │  (Fastify, stateless)
                ┌──────────────┐   presigned URL           │  (×N, ASG)   │
                │ S3/object    │ ◄─────────────────────────┤              │
                │ storage      │                           │  ffmpeg? NO  │
                └──────────────┘                           └──────┬───────┘
                       ▲                                         │ enqueue
                       │ metadata written async                  ▼
                ┌──────────────┐                           ┌──────────────┐
                │   Queue      │ ◄─────────────────────────┤  (SQS /      │
                │ (SQS/Rabbit) │                           │   RabbitMQ)  │
                └──────────────┘                           └──────────────┘
                       │                                          │
                       ▼                                          │
                ┌──────────────┐                                  │
                │ FFmpeg        │  extract duration/rate/bitrate/ │
                │ worker pool   │  loudness (scale-out consumers) │
                └──────────────┘                                  │
                       │                                          │
                       ▼                                          ▼
                ┌──────────────────────────────────────────────────────┐
                │ PostgreSQL (RDS/Aurora)  +  PgBouncer pool           │
                │   + read replicas for the submissions/people views   │
                └──────────────────────────────────────────────────────┘
                       ▲
                       │
                ┌──────┴───────┐   batch job (n8n / Lambda Step Functions)
                │  LLM skill   │   retry w/ exponential backoff, per-key
                │  categorizer │   rate-limit budgeting
                └──────────────┘
```

### Key changes from the local design

- **Uploads → object storage.** Files move to S3 (or a cloud bucket) immediately; the local `uploads/` directory is dropped. Submissions reference an object key, and playback streams from a signed URL. This removes the local-disk bottleneck and gives durability.
- **FFmpeg moves off the request path.** The API validates and stores the file, then publishes a `audio.processed` message. A pool of FFmpeg workers consumes the queue, runs the probe (duration, sample rate, bitrate, EBU-R128 loudness), and updates the row. Requests return fast; workers scale independently. This is the single biggest win — the current inline `fluent-ffmpeg` call is what caps throughput at a handful of submissions/second.
- **Queue + retries.** SQS/RabbitMQ gives exactly-once-per-message processing with DLQ for failed probes (corrupt files, timeouts). Idempotent consumers keyed by `submissionId`.
- **DB stays one primary with replicas.** 5,000 people + 5,000 submissions is tiny for Postgres; the ceiling is connection exhaustion from many API workers, solved with PgBouncer. `AudioSubmission` gains an index on `createdAt` for the list view; people/submissions reads route to a replica.
- **LLM categorization as a throttled batch.** n8n (or Step Functions) processes the 5,000 unclassified people with **per-provider rate-limit budgeting**: a token-bucket aware scheduler that respects RPM/TPM, retries 429s with backoff, and splits the run across multiple API keys / models. At 50 req/min with a paid tier this finishes in ~1.5–2 hours; at free tier it is paced and idempotent, so it resumes across the weekend.

## 4. Concurrency & capacity numbers

- **Upload throughput:** API workers are effectively I/O-bound; 10 workers comfortably handle 100+ concurrent uploads. Storage and the queue absorb spikes.
- **FFmpeg workers:** probe runs ~100–300 ms per file on a 4-core box. 5,000 files × 0.2 s = 1,000 CPU-seconds → 3 workers × 4 cores finish in ~1–2 hours, easily within a weekend. This is CPU-bound, so the worker pool (not the API) is the scaling dimension.
- **DB:** 10,000 rows total — no partitioning needed. `AudioSubmission` gets indexes on `personId`, `createdAt`; `SkillClassification` is unique on `(personId, source)`.
- **n8n:** single instance is enough; the constraint is the LLM provider, handled by pacing + resumable batches (`WHERE sc.id IS NULL` already makes re-runs incremental).

## 5. Reliability & correctness

- **Idempotent ingest:** re-running the merge always yields the same 55-people (at scale, same unique-person set) because all writes are `deleteMany` + upsert keyed on canonical identifiers.
- **Idempotent audio pipeline:** the probe worker upserts metadata by `submissionId`; duplicates in the queue are safe.
- **Exactly-once-ish categorization:** the n8n write uses `ON CONFLICT (personId, source) DO UPDATE`, so re-runs never double-insert.
- **Dead-letter queues + CloudWatch/grafana alerts** on queue depth, probe failure rate, and 429 counts.

## 6. Cost estimate (rough, 5,000 workers, one weekend)

| Item | Sizing | Cost |
|------|--------|------|
| API + workers (t3.small ×3, 2 days) | ~54 vCPU-hours | ~$5 |
| FFmpeg workers (t3.medium ×3, 2 h) | ~24 vCPU-hours | ~$2 |
| Object storage (5,000 × 1–5 MB) | ~25 GB | <$1 |
| Postgres (db.t3.small) | 2 days | ~$7 |
| LLM (paid tier, 5,000 calls) | ~1–2M tokens in/out | $2–$5 |
| **Total** | | **≈ $15–20** |

## 7. What we deliberately did *not* need

- No message queue or replicas for the merge/LLM path (batch, small).
- No CDN (5,000 plays is trivial).
- No DB partitioning (row count is small).
- No microservices — a monolith with a worker pool is the right shape at this scale.

## 8. Where the local build already prepares for this

- `personId`/`submissionId`-keyed upserts everywhere → idempotent consumers.
- `SkillClassification (personId, source)` unique constraint → safe batch re-runs.
- The API already separates "store file" from "extract metadata" conceptually (single inline call today; the seam is the queue).
- All normalization + resolution logic is pure functions in `packages/shared`, so the ingest step can run in any worker without shared state.
