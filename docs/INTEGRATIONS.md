# Backblaze evidence storage and partner inference

Implemented 2026-10-29. Existing Meta SAM segmentation remains the measurement input. Muse Spark tasks can select Meta, Baseten, or Modal independently. Fireworks is prepared but needs the operator's model/deployment details.

## B2-only demo videos and evidence

B2 is required for video uploads and processed evidence. There is **no persistent local copy, filesystem cache, or local storage fallback**. When B2 is unavailable, uploads/verification fail visibly rather than claiming a file was saved. Temporary files exist only while a clip is being decoded and are deleted afterward.

The **Demo Videos** screen (`/demos`) is an authenticated, tenant-scoped library. Select one or several videos to upload, add optional notes, and optionally label a single clip's reference fill. Each card supports private playback and analysis in the selected writable event. Pending uploads can be verified again after a refresh. The five packaged showcase clips are registered automatically when B2 is available. Reference labels are user-supplied; they do not establish independently measured benchmark accuracy.

### Upload and analysis flow

1. Backend creates a pending library record and a short-lived signed B2 PUT URL.
2. Browser sends the file **directly to B2**, without the application's bearer token.
3. Backend verifies object size/type and pins the B2 object version before marking the clip ready.
4. Analyze creates a durable Postgres job referencing that version. No uploaded bytes are held in the job queue.
5. A single backend worker streams the object into a temporary processing file, runs the existing pipeline, and commits the ticket and completed-job status together.
6. Ticket and library playback use short-lived signed B2 GET URLs, so Render does not proxy video playback bytes.

On this small Render deployment, library uploads default to **100 MiB per clip** and analysis to **20 MiB per clip**, with one job processed at a time across events. Larger clips may be stored but need a trimmed copy for analysis. Inference still uses bounded in-memory representations of the currently processed clip; this is not a claim of zero RAM use or a measured production memory ceiling. Moving preprocessing to Modal remains an option for larger workloads.

Interrupted `running` jobs are requeued on backend startup. The original B2 video remains available, so retry does not require re-uploading. Recovery is at least once: a backend kill before transaction commit can repeat an inference request. Live stage telemetry is process-local; durable job status and finished stage traces survive. Full pipeline-result caching is disabled by default (`PIPELINE_RESULT_CACHE_ENABLED=false`) to avoid retaining large mask results in RAM/Redis; the tenant-scoped AI stage cache remains in Postgres.

Required Render secrets/configuration (local `.env` is never pushed):

```dotenv
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=...
B2_S3_ENDPOINT=https://s3.<region>.backblazeb2.com
B2_REGION=...
B2_KEY_PREFIX=loadtruth/evidence
DEMO_UPLOAD_MAX_BYTES=104857600
ANALYSIS_MAX_BYTES=20971520
B2_SIGNED_URL_TTL_S=900
PIPELINE_RESULT_CACHE_ENABLED=false
```

`EVIDENCE_STORAGE`, `EVIDENCE_LOCAL_FALLBACK`, and `EVIDENCE_DIR` no longer select a storage backend. Existing local files are not automatically migrated. Upload clips through Demo Videos to create verified library entries; arbitrary files added through the B2 console are not automatically indexed into a tenant's library.

### Browser CORS

The private bucket needs GET, HEAD, and PUT CORS access from the exact frontend origin. This setup adds the `loadtruth-direct-uploads` rule for `https://loadtruth.tiwabhay800.workers.dev` and `http://localhost:3000`, preserving other S3 rules and leaving bucket visibility unchanged. Credentials stay server-side; signed URLs are short-lived bearer capabilities. Inspect/apply with:

```bash
cd backend
.venv/bin/python -m app.configure_b2_cors
.venv/bin/python -m app.configure_b2_cors --apply
```

Schema migration `0004_demo_videos_jobs` creates the demo-library and durable-job tables. Normal backend startup applies it. The old synchronous ingest endpoint is retained for compatibility, with the same 20 MiB analysis ceiling; New Ticket and Demo Videos use the direct-upload flow.

## Provider configuration

| Provider | Model route | Configuration |
|---|---|---|
| Meta | Existing task-selected Meta model | `MODEL_API_KEY`; SAM always stays on this API |
| Baseten | **`meta-models/muse-spark-open-1026`** | `BASETEN_API_KEY`; default base URL `https://inference.baseten.co/v1` |
| Modal | `meta-models/Muse-Spark-Open-816B-A42B` | `MODAL_BASE_URL`, `MODAL_PROXY_TOKEN_ID`, `MODAL_PROXY_TOKEN_SECRET`; optional `MODAL_ROUTING_AFFINITY_KEY` |
| Fireworks | Explicit model/deployment supplied by the operator | `FIREWORKS_API_KEY`, `FIREWORKS_MODEL`; base URL defaults to `https://api.fireworks.ai/inference/v1` |

Modal sends the proxy ID and secret joined by a period as a Bearer credential. The routing affinity header is sent only when configured. Legacy `.env` names `ModalKey` and `Modal-Secret` are accepted for compatibility; the local environment has been normalized to the official variable names. The Baseten one-time key-sharing link was not opened.

`SPARK_PROVIDER=meta` preserves the existing default. To change the default for chat/vision tasks, choose `baseten`, `modal`, or `fireworks` and restart the backend. In **Settings → AI & Models**, each eligible task also offers named provider models. Selecting one changes that task's route; other tasks and SAM segmentation remain independent. Unconfigured partner choices are disabled in the UI. Per-task overrides currently remain process-local, as before; environment defaults survive restarts.

Fireworks starts with text tasks only. `FIREWORKS_SUPPORTS_VISION=true` explicitly enables vision routing after the model has been verified; do not infer capability from the existence of an API key. SAM segmentation is not routed to generic chat endpoints. OpenAI-compatible describes the request format; these calls use Meta open-weight models hosted by the configured partner, not OpenAI-hosted models.

### Requests and failover

Partner calls use Chat Completions with JSON schemas for structured tasks and normalized outputs for the existing `AIClient` interface. Text answers, OCR, debris classification, load-concept naming, and stage explanations reuse the current parsing and pipeline rules. Video perception sends a bounded set of JPEG keyframes with approximate timestamps, rather than Meta-only `file_id` references. `ffmpeg`/`ffprobe` must be installed for partner video tasks; the backend image already includes them. Image requests send base64 media server-to-server.

Baseten Muse Spark always reasons; no reasoning-effort control is sent to that route. Modal maps balanced to medium, minimal to low, and max to high. These backend calls are non-streaming; the application's existing analyst/progress UI remains responsible for its own event updates.

Optional failover:

```dotenv
SPARK_FALLBACK_PROVIDERS=modal,baseten
```

The selected task provider runs first, followed by that ordered list without duplicates. Transient network/rate-limit/server errors retry within the configured retry budget, then can fall back. Empty, truncated, or incomplete structured responses can also fall back. Authentication and malformed-request failures stop rather than silently hiding bad configuration. SAM errors are not redirected to a text model. Local `.env` keeps Meta primary with the two tested partner fallbacks.

The full-run cache includes task choices, provider endpoints/models, media sampling settings, and fallback configuration. Durable stage caches use a short configuration namespace; ticket evidence pins that namespace so replay does not drift to a later provider selection. Traces record the provider alias and actual served model. Apply migration `0003_evidence_ai_namespace` through normal backend startup or `alembic upgrade head` before using an existing database with this code.

### Usage and pricing

Input, cached-input, output, and reasoning-token usage are normalized into the pipeline ledger. Modal defaults use the rates supplied for this endpoint ($1.25 / $0.15 / $4.25 per million input / cached-input / output tokens). Baseten defaults use its published Muse Spark Open rates, currently the same. Each provider has configurable `*_INPUT_PRICE`, `*_CACHED_INPUT_PRICE`, and `*_OUTPUT_PRICE`; confirm account-specific credits/rates independently.

Fireworks prices default to zero as **unconfigured**, not free. Stage details explicitly mark unknown pricing. Configure rates before relying on the application's spend estimate for that provider. The ledger remains an application estimate, not the provider's billing statement, and provider failures may still incur charges before an answer is usable.

## Verification

Offline regression suite:

```bash
cd backend
MOCK_AI=1 .venv/bin/pytest -q
.venv/bin/mypy app
.venv/bin/ruff check app
```

Opt-in live smoke checks (small billable partner requests; one temporary B2 object):

```bash
cd backend
.venv/bin/python -m app.integrations_check --b2 --providers
```

The live checker uses a generated red square, not private truck footage. It verifies a B2 round trip, checks that a simulated storage outage is not accepted locally, and attempts to delete only its own test object version.

Observed in this session:

| Check | Result |
|---|---|
| B2 upload and checksum/metadata round trip | Passed live |
| Direct signed upload, exact-origin browser preflight, verified library entry, private range playback | Passed live |
| Durable job to completed ticket with mock inference and real B2 | Passed live (isolated test database) |
| B2 outage fails without local fallback | Covered by regression tests |
| Removal of the test object version | Completed |
| Baseten exact hackathon route, structured output, 256×256 image understanding | Passed live |
| Modal configured endpoint, combined proxy token, structured output, 256×256 image understanding | Passed live |
| Fireworks | Adapter/unit tests only; no configured key/model found |

A 32×32 synthetic image initially produced inconsistent color answers across the endpoints; a standard 256×256 image passed. These smoke checks establish connectivity and request compatibility, not truck-measurement accuracy, end-to-end SAM performance, or production load handling. The B2-only demo-library follow-up is local until deployed. Videos live in B2 and analysis jobs are now durable in Postgres; interrupted jobs are recovered at backend startup.

Backend verification: 315 tests pass; Ruff and strict mypy pass. Frontend TypeScript and eight upload/reload/live-stage regressions pass. Authenticated visual QA and production RAM profiling remain unverified. To repeat the isolated cloud smoke check, run `cd backend && .venv/bin/python -m app.demo_check --live`; it uses a temporary SQLite database and removes its own B2 test-object versions.

## Primary references

- [Backblaze boto3 and S3-compatible endpoints](https://www.backblaze.com/docs/cloud-storage-use-the-aws-sdk-for-python-with-backblaze-b2)
- [Baseten Chat Completions](https://docs.baseten.co/reference/inference-api/chat-completions)
- [Baseten vision and media limits](https://docs.baseten.co/inference/model-apis/vision)
- [Baseten reasoning controls](https://docs.baseten.co/inference/model-apis/reasoning)
- [Baseten published prices](https://www.baseten.co/pricing/)
- [Modal proxy token authentication](https://modal.com/docs/guide/webhook-proxy-auth)
- [Modal endpoint integrations](https://modal.com/docs/guide/endpoint-integrations)
- [Fireworks Chat Completions](https://docs.fireworks.ai/api-reference/post-chatcompletions)
- [Fireworks vision input format](https://docs.fireworks.ai/guides/querying-vision-language-models)
