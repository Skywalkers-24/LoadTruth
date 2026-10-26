# Lessons Learned (append-only)

Every mistake, failed command, wrong assumption, or fix that took more than one attempt goes here.
**Rule: never repeat a logged mistake.** Re-read the relevant entry before working in that area.

Entry format:

```
### YYYY-MM-DD — short title
- What happened:
- Root cause:
- Fix:
- Rule going forward:
```

---

### 2026-10-26 — Seed entries from verified facts (prevent predictable mistakes)

- **Muse Spark empty responses.** Muse Spark is a reasoning model; reasoning shares the output budget. Set `max_output_tokens >= 4000` and stream, or responses can come back empty with `finish_reason: length`. Rule: never call Muse Spark for transcription/long structured output without a 4000+ output budget and streaming.
- **SAM 3.1 output is not JSON.** `sam-3.1` returns a special-token grammar on the streamed output-text lane. Parse it with the official `meta_sam_parser` (Python) / `@meta-sam/parser` (TS). Rule: never hand-parse SAM output.
- **One concept per SAM request.** SAM takes a single noun phrase per request; multiple concepts = multiple requests, combined in app code. Rule: loop concepts, don't cram them into one prompt.
- **Cost discipline is a hard constraint.** $150 total credit budget. Sample video at 2–4 fps, cache SAM + Spark by content hash, send Spark only the keyframes it needs, reuse `file_id` across stages. Rule: no uncached model call on a path that runs more than once (e.g. the demo clip).
- **`.env` is gitignored and the key is a placeholder.** `MODEL_API_KEY=TO_BE_UPDATED_LATER`. Rule: before running anything that hits the API, confirm a real key is present; never commit `.env`.

### 2026-10-26 — Monorepo scaffold (backend + frontend)

- **System `python3` is 3.9, not 3.12.** A Python 3.12 interpreter lives at `/opt/homebrew/bin/python3.12`. Root cause: macOS ships an old python3; the backend requires 3.12. Fix: `scripts/setup.sh` auto-detects `python3.12` (or honors `$PYTHON312`) and builds `backend/.venv` with it. Rule: never assume `python3` is 3.12 — always pin the interpreter for the backend venv.
- **hatchling couldn't find the package.** Build failed with "Unable to determine which files to ship" because the project name (`loadtruth-backend`) didn't match a directory and the package dir is `app`. Fix: added `[tool.hatch.build.targets.wheel] packages = ["app"]`. Rule: when the package dir name differs from the project name, declare `tool.hatch.build.targets.wheel.packages`.
- **`app/logging.py` shadowed the stdlib `logging` module** (ruff A005) and broke `import logging` semantics. Fix: renamed to `app/log.py`. Rule: never name a first-party module after a stdlib module (`logging`, `json`, `types`, etc.).
- **`set -e` in setup.sh aborted before `npm install`** when the backend pip step failed, leaving the frontend with no `node_modules` — which then looked like separate frontend errors. Root cause: one script doing two independent setups under `set -e`. Lesson: when diagnosing, verify the real state (`node_modules` was simply absent) before treating downstream errors as real. Keep backend/frontend setup independent so one failure doesn't mask the other's state.
