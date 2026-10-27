# Test clips (`data_tests/`)

Fake ~1 MB H.264 MP4 clips for exercising the clip-upload → pipeline flow in
**mock-AI mode** (`MOCK_AI=1`). They contain random-noise video (no real trucks)
— the point is to drive the backend's deterministic mock scenarios, not to be
watchable footage.

## How the scenario is chosen

The mock pipeline reads a **scenario from the filename prefix** `scenario__…mp4`.
The prefix must match a fixture key in `backend/app/ai/fixtures/scenarios.json`.
Drop any of these into **New Ticket** (or POST to `/events/{id}/ingest`) to see
that path:

| File | Expected result |
| --- | --- |
| `clean-full-cd__haul.mp4` | Clean draft ticket — truck `FL-DT-3391`, C&D, full load. **201** |
| `clean-partial-veg__haul.mp4` | Clean draft — truck `FL-DT-2204`, vegetative, partial. **201** |
| `low-confidence-placard__haul.mp4` | Drafts a ticket but flags "placard unreadable" (no/low-confidence ID). **201 + anomaly** |
| `hollow-load__haul.mp4` | Drafts a ticket flagged as a possible hollow/fluffed load. **201 + anomaly** |
| `uncertified-truck__haul.mp4` | Drafts a ticket flagged "uncertified truck" (not in the registry). **201 + anomaly** |
| `no-truck__street.mp4` | No truck detected — **422**, no ticket drafted. |
| `ordinary__random-haul.mp4` | No matching prefix → treated as an ordinary upload; always drafts a believable clean ticket. **201** |

Any file **without** a recognized `scenario__` prefix (e.g. a real upload) is
hashed and mapped deterministically to a clean positive scenario, so an ordinary
drag-and-drop always drafts a ticket.

## Error paths to try

- An **empty** file → **400** ("The upload was empty").
- A **non-video / corrupt** file (e.g. rename a `.txt` to `.mp4`) → **400**
  ("could not be read as a video or image").

## Regenerating

Clips are produced with ffmpeg (see `scratch/gen_testdata3.sh` in history). They
are ~1 MB each; the bytes are random noise so the file size is honest rather
than a compressed near-empty clip.
