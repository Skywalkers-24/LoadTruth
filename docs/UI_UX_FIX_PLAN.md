# Ticket workflow and pipeline UX — single coordinated fix

## Outcome

Give each screen one purpose: **Tickets** lists event records; **New Ticket** captures evidence and shows the current analysis; **Pipeline Runs** inspects live and completed processing; **Review Console** inspects a ticket and handles exceptions. Keep existing routes and permissions working. No deployment or data migration is needed.

## Findings and implementation

| Finding | Fix | Acceptance |
|---|---|---|
| `/add` mixes upload, analysis, and an unpaginated 100-ticket ledger | Move listing to `/tickets`; retain focused capture and generated-ticket summary on `/add` | Tickets has server pagination, status filtering, empty/error/loading states, and links into the console |
| “Ticket” is ambiguous in navigation | Name destinations Tickets, New Ticket, Review Console, Pipeline Runs; align palette and mobile navigation | Navigation distinguishes records, capture, processing, and exceptions |
| Live flow only exposes the latest summary | Add expandable stage analysis to the live flow using the existing detailed trace component | Received stages expose analysis, model, timing, confidence, and facts while the run proceeds |
| Completed progress stops polling, so pipeline view misses new runs | Continue low-frequency discovery when idle; poll faster while running | New uploads from another page become visible without a reload |
| Previous run can remain on screen during a new upload | Scope capture progress to the previous server attempt identity | Old completed stages are not presented as the new upload |
| Most recently received stage is falsely shown as still executing | Treat received records as completed; label remaining stages as waiting | No invented per-stage execution or percentage progress |
| Failed runs use success styling; network errors look empty | Explicit failed, disconnected, waiting, and idle states; retry action | Failed processing and unavailable telemetry are distinguishable |
| Pipeline header claims “Live” at all times; large live and history panels repeat results | Remove unconditional Live badge; live section appears for active/failed runs; history focuses on selected run | One current-run detail view and a separate historical inspector |
| Sidebar and header both show search; analyst page also shows floating analyst | Retain header search and suppress duplicate floating assistant on its dedicated page | One search entry point in shared chrome and one analyst surface |
| White-only sidebar hover/borders and hardcoded active icon colors ignore light palettes | Use existing semantic sidebar tokens | Shared chrome follows all six light/dark palette definitions |
| Theme provider initially writes defaults before loading saved preference | Delay persistence until saved preferences have hydrated | Saved theme/mode is not overwritten during mounting |

## Scope and validation

Preserve the existing design system and semantic colors. Avoid adding palettes, billing features, or backend inference changes. Use existing stage facts; model-authored stage explanations may arrive at completion, and waiting stages cannot have an analysis before output exists. Live telemetry remains the latest run per event and process-local; completed ticket traces can be restored from the existing persisted stage records. Do not claim concurrent-job live tracking.

Run TypeScript checks, relevant frontend regression tests, and formatting/diff checks. Check responsive structure and theme token usage in source. Browser-based visual review requires an available browser tool and authenticated backend; report that limit if unavailable. No broad certification of every screen's appearance is implied by source checks.

## Validation results

Implemented locally. TypeScript and 33 tests across eight relevant frontend suites pass, including five pipeline regressions and saved theme persistence. The complete initial suite also exposed two existing `api.test.ts` expectations that assume `getHealth()` returns null on errors, whereas the current API client throws; these unrelated tests were not changed. No browser-control tool is available in this session, so authenticated visual QA and the twelve palette/mode combinations remain unverified. Changes have not been deployed.

## Refresh-safe upload follow-up

New Ticket now uses `POST /events/{event_id}/ingest-jobs`: after receiving the complete file, the API acknowledges it with 202 and publishes a live processing slot before starting analysis in an independent task/session. `GET` on the same route recovers the latest job after browser reload, including its finished ticket or failure. The synchronous ingest endpoint remains for existing integrations. The UI warns against leaving during file transfer and explicitly confirms when refreshing is safe. A second active upload for the same event is rejected rather than overwriting its progress.

This is refresh-safe on the current single-process backend, not a persistent worker queue. In-flight jobs and uploaded bytes are process-local; restarting or replacing that backend interrupts them. Multiple replicas require a shared durable job store/queue. Finished tickets and stage records retain their existing database persistence.
