"""Try SAM 3.1 concept phrases on a stored evidence clip, then measure the fill.

Use it to tune ``sam_bed_concepts`` / ``sam_rim_concept`` / ``sam_load_concepts``
on real footage before changing the defaults. It sends ONE SAM video request per
phrase (50-frame minimum, about $0.01 each) and prints what matched; with
``--measure`` it then runs the production measurement offline over the results.

    scripts/sam-probe.sh <content_hash> "truck bed" "tailgate" "debris pile" "pile" --measure

The clip must already be in ``media/evidence/`` (every ingested clip is). Output
text is saved under ``scratch/probe/`` so later analysis needs no model call.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.ai.meta_http import MetaHTTP  # noqa: E402
from app.ai.sam_measure import measure, parse_segmentation  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.pipeline.geometry import MaskMeasurement, estimate_fill  # noqa: E402

OUT = ROOT / "scratch" / "probe"


async def _segment(http: MetaHTTP, url: str, concept: str) -> str:
    payload = {
        "model": get_settings().sam_model,
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [
                    {"type": "input_text", "text": concept},
                    {"type": "input_video", "video_url": url},
                ],
            }
        ],
        "metadata": {"mask_encoding": "one_bit", "include_confidence": "true"},
    }
    return (await http.stream_response(payload)).text


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("content_hash")
    ap.add_argument("concepts", nargs="+")
    ap.add_argument("--measure", action="store_true", help="bed=1st, rim=2nd, loads=rest")
    args = ap.parse_args()

    s = get_settings()
    clip = Path(s.evidence_dir) / args.content_hash
    if not clip.is_file():
        print(f"No evidence clip at {clip}", file=sys.stderr)
        return 2
    url = "data:video/mp4;base64," + base64.b64encode(clip.read_bytes()).decode()
    print(f"Sending {len(args.concepts)} SAM request(s), about ${0.01 * len(args.concepts):.2f}")
    http = MetaHTTP(api_key=s.model_api_key, base_url=s.model_api_base_url, timeout_s=300)
    try:
        texts = await asyncio.gather(*(_segment(http, url, c) for c in args.concepts))
    finally:
        await http.aclose()

    OUT.mkdir(parents=True, exist_ok=True)
    runs = {}
    for concept, text in zip(args.concepts, texts, strict=True):
        (OUT / f"{args.content_hash[:8]}__{concept.replace(' ', '_')}.txt").write_text(text)
        dets = parse_segmentation(text, media_kind="video")
        runs[concept] = dets
        frames = len({d.frame for d in dets})
        objects = len({d.object_id for d in dets})
        print(f'  "{concept}": {objects} object(s) on {frames} frame(s)')

    if args.measure and len(args.concepts) >= 3:
        bed, rim, *loads = args.concepts
        result = measure(
            runs[bed],
            [d for c in loads for d in runs[c]],
            media_kind="video",
            max_frames=s.max_sampled_frames,
            rim_run=runs[rim],
        )
        b, ld = result.by_label("truck bed"), result.by_label("debris pile")
        if b is None or ld is None or not b.mask_areas:
            print("No bed measured.")
            return 1
        est = estimate_fill(
            [
                MaskMeasurement(
                    sum(b.mask_areas) / len(b.mask_areas),
                    sum(ld.mask_areas) / len(ld.mask_areas),
                    ld.load_height_ratio,
                )
            ],
            load_source=result.load_source,
            coverage_spread=result.coverage_spread,
        )
        print(
            f"Fill {est.fill_pct}% (confidence {est.confidence:.2f}, "
            f"{len(b.mask_areas)} frames, load {result.load_source}) {result.notes}"
        )
        for note in est.quality_notes:
            print(f"  review: {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
