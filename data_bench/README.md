# 50-Clip Local Benchmark and Replay

This document describes the planned workflow for analyzing the 50 prepared demo
videos once, saving each result, and replaying those same results for users
without calling the model provider again.

## Dataset on this machine

- Original input archive: [`../scratch/videos.zip`](../scratch/videos.zip) - leave
  unchanged.
- Prepared clips: [`../scratch/videos_processed/`](../scratch/videos_processed/),
  named `001.mp4` through `050.mp4`.
- Shareable prepared archive:
  [`../scratch/videos_processed.zip`](../scratch/videos_processed.zip).
- The prepared clips were checked as 1280×720 H.264 at 24 fps, 240 frames and
  about 10 seconds each, with AAC audio. `scratch/` is gitignored, so these
  files are local to the machine and are not included in a repository checkout.

These are demo inputs, not labeled ground truth. Do not treat a model's own
estimate as the correct answer when reporting accuracy.

## Current status and boundaries

- `scripts/benchmark.sh` runs the existing known-volume benchmark. It reads
  `data_bench/ground_truth.csv`, sends each matching clip through the pipeline,
  and writes aggregate and per-clip fill-error statistics to
  `data_bench/results.json`. Its current example rows do not describe the
  numbered demo videos. For an accuracy report, create a separate manifest for
  these clips and independently establish each true fill percentage and
  conditions first.
- The runner processes clips sequentially, but it does not persist complete
  analysis records for later user-facing playback.
- The app already has demo-video upload/job records, ticket and pipeline-stage
  persistence, a content-hash cache, and deterministic ticket re-verification.
  These pieces are not yet a complete, durable replay path for this 50-clip
  batch. A cache hit is not a substitute for saving and serving the final
  analysis snapshot.
- [`../backend/showcase/benchmark.json`](../backend/showcase/benchmark.json) is
  a separate curated showcase bundle. [`../backend/seed.json`](../backend/seed.json)
  seeds tenant demo data; neither should be used as the storage location for
  per-run results from these 50 clips.
- Local development defaults to SQLite. Demo media upload/playback currently
  uses B2 storage; local SQLite alone does not make the media available to the
  app.

## One-time analysis workflow

1. Keep the 50 source clips read-only and use their numbered names as stable
   dataset IDs (`demo50-001` through `demo50-050`). Compute SHA-256 from the
   exact bytes passed to the pipeline.
2. Record a manifest row per clip: dataset ID, filename, content hash, byte
   size, duration, resolution, frame rate, and any independently verified
   ground truth or capture labels. Keep ground-truth labels separate from
   predictions.
3. Run the real pipeline locally, one clip at a time, in live-model mode.
   Record the model and measurement versions, effective configuration, start
   and finish times, cost/usage where available, and success or failure for
   every clip. Do not mark a failed or partial run as complete.
4. Persist the complete result before starting the next clip: the ticket
   values and classification, anomaly flags, evidence-frame references,
   ordered pipeline-stage results, model provenance, and reproducibility
   receipt/inputs where available. Preserve failures and retries as separate
   run attempts rather than overwriting a successful result.
5. Verify the batch has 50 successful records, each linked to the expected
   clip hash, before making it available for replay.

Use the existing accuracy runner only when an independent truth manifest is
ready. If the goal is demo playback rather than accuracy measurement, save the
pipeline result for each clip even when no ground truth is available.

## Local-first storage and replay contract

Use the local SQLite database as the initial structured store, with the clip
files kept in the local working dataset. Reuse the existing demo-video, job,
ticket, anomaly, and pipeline-stage concepts where they fit; add a stable
dataset/run identity and pinned model/config provenance wherever the current
records do not retain them. Keep a portable JSON export of the manifest and
completed run records for backup and migration. Store generated records and
media outside tracked source files; never put credentials or private provider
responses in `seed.json`.

Replay must look up a completed, versioned result by dataset/run ID and return
the saved ticket, stages, flags, and evidence references. It must not invoke
the AI client, start an analysis job, or silently fall back to fresh inference
when a saved result is missing. Return a clear not-found/unavailable state
instead. The app may still make ordinary backend read requests to load the
saved result; the no-call guarantee here means no model-provider inference.

Keep the original `content_hash` as the identity of the exact media bytes, and
use a distinct run ID/version for each analysis configuration. This preserves
older results if models, prompts, or measurement logic change.

## Later Supabase promotion

Once the local batch is reviewed, migrate the structured manifest, run
metadata, tickets, flags, and stage results to Supabase Postgres while
preserving dataset IDs, run IDs, hashes, and timestamps. Apply tenant scoping
and RLS to user-visible records. Store the media in the configured object
store (currently B2) and retain stable object/version references in the
database; moving media to Supabase Storage is a separate decision. Verify the
migrated record count and hashes, then test replay with model-provider access
disabled to prove that playback uses saved results only.

## Acceptance checklist

- [ ] One manifest entry exists for each numbered clip, with matching SHA-256.
- [ ] All 50 analyses have a durable success record or an explicitly recorded
      failure; no partial output is presented as complete.
- [ ] Results include enough saved stages and evidence references to render the
      same demo without recomputing inference.
- [ ] Replaying a completed result makes zero model-provider calls.
- [ ] Missing results produce an explicit unavailable response, not an
      unannounced inference request.
- [ ] Local and Supabase copies preserve IDs, result versions, and media hashes.
- [ ] Any reported accuracy uses independently established ground truth.
