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

New Ticket and Demo Videos now upload directly to private Backblaze B2 through a signed URL, verify the uploaded object, and queue analysis from the saved clip. Demo Videos lists the library, supports batch uploads and private playback, and can start analysis in a writable event. The five packaged showcase clips are registered in the library when B2 is available. Optional reference fill percentages support manual comparison; these labels are not independently verified benchmark results.

Jobs are persisted in the database. Reloading after upload verification recovers the queued/running/completed job. A backend restart requeues interrupted work; the single-process worker runs one analysis at a time. Browser refresh during file transfer still interrupts that transfer. Local persistent media and fallback storage have been removed. Temporary processing files are deleted after processing. Default limits are 100 MiB per library upload and 20 MiB per analysis; full pipeline result caching is disabled by default to reduce memory retention.
