# LEARNINGS — Meta Model API (Spark, Muse, SAM)

Practical notes on calling the three Meta models used in LoadTruth. These are
written from actual runs against `https://api.meta.ai/v1`, not docs.

> **Key takeaway:** The three models share **one** endpoint (`/v1/responses`) but
> behave very differently. The biggest trap: **SAM returns segmentation masks,
> not a text answer.** Asking it "how many X?" gives you nothing useful — you
> must prompt it with the bare concept and *count the instances it returns*.

---

## 0. Common setup

- **Endpoint:** `POST https://api.meta.ai/v1/responses`
- **Auth:** `Authorization: Bearer $MODEL_API_KEY` (from repo-root `.env`)
- **File uploads (for images by ref):** `POST https://api.meta.ai/v1/files`
  with `purpose=user_data`. Returns `{ "id": "file-..." }`. The upload itself
  is **not** a model call and does not consume model credits.
- **Request shape:** an `input` array of `message` objects, each with a `role`
  and a `content` list of typed parts (`input_text`, `input_image`, ...).
- A plain string can also be passed as `input` for text-only calls (see Spark).

### Config knobs (backend/app/config.py)
| Setting | Env var | Default | Meaning |
|---|---|---|---|
| `spark_model` | — | `muse-spark-1.3` | reasoning / VLM model name |
| `sam_model` | — | `sam-3.1` | segmentation model name |
| `model_api_base_url` | — | `https://api.meta.ai/v1` | API base |
| `mock_ai` | `MOCK_AI` | `false` | replay fixtures, $0, no network |
| `build_spend_cap_usd` | `BUILD_SPEND_CAP_USD` | `100` | soft app-side spend cap |

Set `MOCK_AI=true` to develop at $0 — all calls route through
`MockAIClient` (fixtures) instead of hitting Meta.

---

## 1. Muse Spark (`muse-spark-1.3`) — reasoning + vision-language

Spark is the general **reasoning / VLM** model. It answers in **prose** and
supports a `reasoning.effort` knob (`low` | `medium` | `high`).

### Text-only call
```bash
curl -sS --max-time 300 -X POST "https://api.meta.ai/v1/responses" \
  -H "Authorization: Bearer $MODEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "muse-spark-1.3",
    "reasoning": { "effort": "low" },
    "input": "A bat and a ball cost $1.10 ... How much does the ball cost?"
  }'
```
(See `test_api.sh`.)

### Image + text call (multimodal)
Send the image inline as a base64 data URL in an `input_image` part:
```json
{
  "model": "muse-spark-1.3",
  "reasoning": { "effort": "low" },
  "input": [{
    "type": "message",
    "role": "user",
    "content": [
      { "type": "input_text",  "text": "How many umbrellas are in this image?" },
      { "type": "input_image", "image_url": "data:image/png;base64,<...>" }
    ]
  }]
}
```
(See `test_vision.sh`, which downscales with `sips -Z` first to keep the call
cheap/fast.)

### Reading the answer
The text lives in `output[].content[]` where `type == "output_text"`:
```python
text = ""
for item in data.get("output", []):
    if item.get("type") == "message":
        for c in item.get("content", []):
            if c.get("type") == "output_text":
                text += c.get("text", "")
```

### Cost / usage
Billed **per token**. `usage` reports `input_tokens`, `output_tokens`,
`output_tokens_details.reasoning_tokens`, `total_tokens`.
Rough pricing used in `test_vision.sh`: **$1.25 / 1M input, $4.25 / 1M output.**

### Gotchas
- `test_vision.sh` is named "vision" but defaults to **Spark**, not SAM —
  override with `MODEL=sam-3.1 ./test_vision.sh` if you really want SAM.
- Downscale big images before base64 or you hit payload-size limits and slow
  calls. `sips -Z 1024` (longest edge) is a good default on macOS.

---

## 2. SAM (`sam-3.1`) — segmentation, NOT a chatbot

**This is the one that "returns something else."** SAM is Segment Anything. It
does **not** answer questions in words. Given a concept, it returns a list of
**segmented instances**, each with a bounding box and an encoded mask.

### How to call it
1. Upload the image, get a `file_id`:
```python
up = requests.post(
    "https://api.meta.ai/v1/files",
    headers={"Authorization": f"Bearer {api_key}"},
    data={"purpose": "user_data"},
    files={"file": ("upload.png", open("crowd.png", "rb"), "image/png")},
)
file_id = up.json()["id"]
```
2. One inference call, referencing the file by `file_id`, streamed:
```python
payload = {
    "model": "sam-3.1",
    "input": [{
        "type": "message", "role": "user",
        "content": [
            { "type": "input_text",  "text": "umbrella" },     # <-- bare concept
            { "type": "input_image", "file_id": file_id },
        ],
    }],
    "stream": True,
    "metadata": { "mask_encoding": "one_bit" },
}
```
(See `test_sam_crowd.py` / `run_sam.sh`.)

### CRITICAL: prompt with the concept, not a question
| Prompt | Result |
|---|---|
| `"How many umbrellas are in this image?"` | **empty** text output — useless |
| `"umbrella"` | 41 segmented instances returned |

SAM wants the **noun / concept to segment**, not a natural-language question.

### What it returns (and how to count)
The `output[].content[].text` field contains a token-encoded list of instances,
indexed from 0, each `<|box;...|>` + `<|mask;...|>`:
```
0<|box;x1=619;y1=235;x2=724;y2=306;w=1076;h=1920|><|mask;x=0;y=0;data=...|>,
1<|box;x1=28;y1=598;...|><|mask;...|>,
...
40<|box;x1=727;y1=1372;...|>
```
- Coordinates are in the image's **native pixel space** (`w`,`h` give the frame).
- **The count = number of instances** (highest index + 1). For `crowd.png` +
  `"umbrella"` → **41 umbrellas** (indices 0–40).
- `mask_encoding: one_bit` → masks are run-length-ish encoded binary blobs; you
  decode them if you need the actual pixel masks, otherwise just use the boxes.

### Streaming note
SAM may emit the whole result in `response.output_text.done` /
`response.completed` with **no** `output_text.delta` events. If you only print
deltas you'll think it returned nothing. Read the final event's text, or walk
`response.output[].content[]` on `response.completed`.

### Cost / usage
Billed **per image**, not per token. Observed `usage`:
`{"images_processed": 1, "input_tokens": 0, "output_tokens": 0, "total_tokens": 0}`.

### Interpreting the response (boxes + masks)

The whole result is one string. Each detected instance is:
```
<index><|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|><|mask;x=..;y=..;data=<W>,<H>,<RLE>|>
```
Instances are comma-separated; a leading control marker like `<0f>` may prefix
instance 0.

**Box** — `<|box;x1;y1;x2;y2;w;h|>`
- `(x1,y1)` top-left, `(x2,y2)` bottom-right, in **native pixel coords**.
- `w,h` = full image size (e.g. 1076×1920) = the coordinate space for everything.

**Mask** — `<|mask;x;y;data=W,H,<rle>|>`
- `x,y` = where the mask grid sits in the image.
- `data` starts with the mask's own `W,H` (pixels), then a **one-bit RLE**
  bitmap (because we requested `mask_encoding: one_bit`): each pixel is 0
  (background) or 1 (object).
- The RLE is printable-ASCII run lengths that alternate starting from 0; a char's
  run length ≈ `ord(c) - ord('!')`. Runs of `!` = long background spans. Sum the
  "1" runs to get the object's pixel area. (This dialect is inferred from the
  data, not documented — treat decoded area as approximate.)

**Three ways to use it**
| Need | Do this |
|---|---|
| Count | number of instances = highest index + 1 (→ **41** for crowd/umbrella) |
| Locate | parse the `box` fields, draw rectangles |
| Exact shape / area | decode the mask RLE to a W×H bitmap, place at `(x,y)` |

**Tooling in this repo**
- `sam_decode.py` — pure-stdlib parser: prints count + per-instance boxes +
  decoded mask area, and writes an **annotated SVG overlay** (`sam_overlay.svg`)
  with numbered boxes over the source image. No numpy/Pillow needed.
- Run against a saved answer:
  `python3 sam_decode.py sam_answer.txt crowd.png sam_overlay.svg`
- The venv has **no Pillow/numpy**, so visualization is done via SVG rather than
  raster libraries. Install `pillow`/`numpy` only if you need real raster mask
  compositing.

---

## 2a. How the live pipeline calls Meta (backend/app/ai/live.py)

Verified against the docs on 2026-10-27 ([segmenting](https://dev.meta.ai/docs/sam/segmenting), [reading output](https://dev.meta.ai/docs/sam/reading-segmentation), [video understanding](https://dev.meta.ai/docs/video-understanding), [structured output](https://dev.meta.ai/docs/features/structured-output/), [reasoning](https://dev.meta.ai/docs/reasoning), [file handling](https://dev.meta.ai/docs/file-handling)). Some earlier notes in §2 were inferred and are corrected here.

- **SAM takes one concept per request.** Comma lists return zero matches; a second `input_text` part segments only one concept. The pipeline sends two streamed requests per clip ("truck bed", "debris pile"; settings `sam_bed_concept` / `sam_load_concept`) in parallel.
- **Video is first class.** Send `input_video` with `video_url` (data URL) or `file_id`. The output is one line per frame: `<Nf>` then `id<|box…|><|mask…|>` records. Object ids are stable across frames and not dense. Frames with nothing visible emit no line.
- **Masks are base85, not printable run lengths.** The first character after `H,W,` is the encoding (`~` lossless, `!` one_bit), and the mask raster spans the box. The pipeline decodes with Meta's `meta-sam-parser` package (`decode_mask_to_raster`), not hand-written regexes.
- **The live API finalizes the text lane with `response.content_part.done`.** The transport takes the final text from that event (or `output_text.done`, or `response.completed`), and only falls back to joining deltas.
- **Zero matches is a valid answer.** The stream completes with empty text. The pipeline treats "no bed found" as no truck (HTTP 422), and "bed found, no debris" as a 0% fill.
- **SAM billing:** $2.50 per 1,000 images; video $0.20 per 1,000 frames with a 50-frame minimum per request. Before sending, ffmpeg resamples the clip to `frame_sample_fps` (3), drops audio, and caps the longest edge at 1024 px (`app/pipeline/transcode.py`).
- **Spark accepts video directly** through `input_video` (`file_id` or `video_url`), MP4 only, so no frame extraction is needed for OCR or classification.
- **Structured output on the Responses API is `text.format`,** not `response_format` (that returns 400): `{"type": "json_schema", "name", "schema", "strict": true}`.
- **Reasoning tokens count against `max_output_tokens`.** A 64-token cap returns an empty answer. Caps are now 4000 for perception and 2000 for narration; billing is on tokens actually used.
- **Effort values are** `minimal, low, medium, high, xhigh, max` (`none` returns 400 on Spark). The admin UI's "balanced" is sent as `medium`.
- **Uploaded files never expire by default.** Uploads set `expires_after` (1 hour) and are deleted with `DELETE /v1/files/{id}` when the run ends.

**First real run (2026-10-27, 15.2 MB 1080p clip of a truck hauling a dumpster; full exchange in `logs/meta_api.jsonl`):**
- ffmpeg shrank it to 2.2 MB (1024x576, 3 fps, 30 frames), small enough to send inline as a data URL.
- SAM stream events, in order: `response.created`, `in_progress`, `output_item.added`, `content_part.added`, one `output_text.delta` per frame (30), `output_text.done`, `content_part.done`, `output_item.done`, `completed`. Usage reports `video_frames_processed: 50` (the minimum) and zero tokens.
- "truck bed" returned one stable track (id 0) on all 30 frames. "debris pile" returned two tracks: the load on top of the bed, and a small object above and behind the truck.
- Each SAM request took about 5.5 s, and both ran in parallel. Decoding and measuring the masks in Python then took about 15 s.
- Spark OCR read `FL-DT-3391` (confidence 0.9) in 15 s: 2,731 tokens in, 896 out, of which 855 were reasoning at effort `low`. Classify returned `construction_demolition` (0.95) in 19.5 s: 2,748 in, 440 out.
- Total about $0.033 for the clip and about 41 s end to end. Reasoning tokens are most of the Spark output cost.

**Geometry calibration (open item).** `app/ai/sam_measure.py` measures the bed track with the largest box area, counts debris pixels inside the bed's horizontal span and above its floor, and takes load height from the top of the debris on the frame with the largest bed area. These are first-pass heuristics. Check them against clips with known fills (the ±10% target) and tune the concept phrases, which are settings.

**Try it:** `make live-check` (key check, one tiny Spark call) and `make live-check CLIP=data_tests/ordinary__random-haul.mp4` (full pipeline live, prints each stage and the cost).

---

## 3. Quick comparison

| | Muse Spark 1.3 | SAM 3.1 |
|---|---|---|
| Purpose | reasoning + VLM | image segmentation |
| Prompt style | natural language question | bare concept noun |
| Image input | `input_image` + `image_url` (base64 data URL) | `input_image` + `file_id` (upload first) |
| Output | prose in `output_text` | list of box+mask instances in `output_text` |
| "How many X?" | answers in words | **returns nothing** — ask for `"X"` and count instances |
| Billing | per token | per image |
| Extra knobs | `reasoning.effort` | `metadata.mask_encoding` |

---

## 4. Credit discipline

- One inference call per experiment. Uploads (`/v1/files`) are free of model
  cost.
- `MOCK_AI=true` → zero-cost local development via fixtures.
- App-side soft cap: `BUILD_SPEND_CAP_USD` (warn at `SPEND_WARN_USD`). These are
  enforced by LoadTruth, not by Meta — they don't touch your Meta account
  billing or credits.

---

## 5. Media size, limits & the optimizations we apply

Sourced from the Meta docs (dev.meta.ai/docs/file-handling, media-segmentation,
pricing) and applied in `backend/app/pipeline/media.py` + `frames.py`. The seven
pipeline stages are unchanged; only *how* bytes reach the models is optimized.

### The hard limits that shape the design
| Limit | Value | Where it bites |
|---|---|---|
| Inline request (`file_data` / `file_url`) | **50 MB** | a single clip sent inline per call |
| Files API upload (reusable `file_id`) | **1 GiB** | large clips; upload once, reuse the id |
| Images per VLM (Spark) request | **50** | frames handed to OCR/classify |
| Team storage (uploaded files) | **100 GiB** shared | uploaded files don't expire — delete them |
| SAM video segmentation billing | **$0.20 / 1,000 frames** | the sampled-frame count is the #1 cost lever |
| Spark billing | **$1.25 / 1M in, $4.25 / 1M out** | frame resolution → input tokens |
| Video MIME | `video/mp4` only | transcode other containers before ingest |

### Does it compress? How large a clip can we take?
- We do **not** re-encode the clip; compression is handled upstream (the source
  camera / uploader). What we control is **frame sampling** and **downscaling**,
  which is where the cost is.
- A clip up to **1 GiB** is accepted (via the Files API). Between our soft
  threshold (`media_inline_max_bytes`, 8 MB) and 1 GiB it is **uploaded once**
  and referenced by `file_id` across all three per-clip calls (SAM track, Spark
  OCR, Spark classify) — the bytes travel once, not three times. Under 8 MB it
  goes inline to skip the upload round-trip. Over 1 GiB is rejected with 413.

### The optimizations (all cost/latency, zero stage changes)
1. **Sample, don't stream every frame.** Stage 1 samples at 2–4 fps and hard-caps
   at `max_sampled_frames` (120). A 10-min clip is ~120 frames to SAM, not 18,000.
2. **Upload once, reuse `file_id`.** One upload serves SAM + both Spark calls.
3. **Hand Spark a few keyframes, downscaled.** OCR/classify get
   `spark_frames_per_task` (4) evenly-spaced keyframes, each downscaled to a
   1024 px longest edge — far under the 50-image budget, and small base64 =
   fewer input tokens.
4. **Content-hash cache.** A repeat clip (same bytes) returns the cached result
   for **zero** model calls — the hash is the key for both the cache and the
   fixture replay.
5. **Budget caps.** The cost ledger stops the run at `SPEND_WARN_USD` /
   `BUILD_SPEND_CAP_USD` so a volume spike can't run away.

### Config knobs (backend/app/config.py)
`media_inline_max_bytes` · `media_upload_threshold_bytes` ·
`spark_max_images_per_request` · `spark_frames_per_task` · `max_sampled_frames` ·
`frame_downscale_longest_edge` — all tunable per deployment.
