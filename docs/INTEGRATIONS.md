# Backblaze evidence storage and partner inference

Implemented 2026-10-29. Existing Meta SAM segmentation remains the measurement input. Muse Spark tasks can select Meta, Baseten, or Modal independently. Fireworks is prepared but needs the operator's model/deployment details.

## Backblaze B2

The backend uses the bucket's S3-compatible endpoint through boto3. It keeps a local working copy for playback and fallback, uploads processed evidence with MIME type, frame rate, and a SHA-256 checksum, and restores missing local files from B2 on demand. The ticket evidence endpoint still checks the signed-in user's tenant before serving media. No bucket credentials or public bucket URLs are exposed to the browser. Backend-only access needs no CORS changes.

Required server secrets/configuration:

```dotenv
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=...
B2_S3_ENDPOINT=https://s3.<region>.backblazeb2.com
B2_REGION=...
EVIDENCE_STORAGE=auto
EVIDENCE_LOCAL_FALLBACK=true
B2_KEY_PREFIX=loadtruth/evidence
```

`auto` selects B2 when all its required settings are present, otherwise local storage. `local` disables bucket access. `b2` requires complete bucket configuration. With local fallback enabled, a failed remote write is logged and local evidence stays available. A missing local file plus an unavailable remote object is reported as unavailable evidence. `EVIDENCE_LOCAL_FALLBACK=false` makes remote errors fail instead of silently continuing. Local fallback files alone are not durable on ephemeral hosts; cloud errors must be resolved before relying on long-term retention.

Existing local files are not bulk migrated automatically. A future save of a clip replicates its existing processed copy. No remote bucket-wide cleanup, CORS change, or public-access change is performed.

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

The live checker uses a generated red square, not private truck footage. It explicitly verifies remote persistence, restores from a new empty local directory, simulates a cloud outage for local fallback, and attempts to delete only its uniquely created remote object version.

Observed in this session:

| Check | Result |
|---|---|
| B2 upload, checksum/metadata, restore after local disk loss | Passed live |
| Local fallback with a simulated B2 outage | Passed |
| Removal of the test object version | Completed |
| Baseten exact hackathon route, structured output, 256×256 image understanding | Passed live |
| Modal configured endpoint, combined proxy token, structured output, 256×256 image understanding | Passed live |
| Fireworks | Adapter/unit tests only; no configured key/model found |

A 32×32 synthetic image initially produced inconsistent color answers across the endpoints; a standard 256×256 image passed. These smoke checks establish connectivity and request compatibility, not truck-measurement accuracy, end-to-end SAM performance, or production load handling. No production deployment was made. Backblaze now preserves saved media; in-flight ingest jobs are still process-local and do not automatically resume after backend replacement.

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
