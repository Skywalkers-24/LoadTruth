"""SAM 3.1 output -> Stage-5 measurements (app/ai/sam_measure.py). No network."""

from __future__ import annotations

import asyncio

import pytest

from app.ai import sam_measure
from app.ai.base import TrackResult
from app.ai.sam_measure import (
    BED_LABEL,
    LOAD_LABEL,
    LOAD_NONE,
    LOAD_PREFIX,
    LOAD_SEGMENTED,
    MEASURE_VERSION,
    RIM_LABEL,
    Box,
    Detection,
    frames_covered,
    measure,
    measure_frame,
    parse_segmentation,
    parse_segmentation_async,
    remeasure,
)

# Two records copied from dev.meta.ai/docs/sam/reading-segmentation (lossless masks).
MASK_0 = "~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x("
MASK_1 = "~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@"
DOC_FRAME = (
    f"<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,{MASK_0}|>"
    f",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,48,{MASK_1}|>"
)

# A bed box 200 wide x 100 tall whose tailgate starts 60 rows down: the opening
# is rows 100..159 at the full 200 px width = 12,000 px.
BED = (100, 100, 300, 200)
RIM = (100, 160, 300, 200)


def _det(
    frame: int, oid: str, box: tuple[int, int, int, int], size: tuple[int, int] = (1000, 1000)
) -> Detection:
    return Detection(frame, oid, Box(*box), media_size=size)


def _load(result: TrackResult) -> tuple[list[float], list[float]]:
    bed, load = result.by_label(BED_LABEL), result.by_label(LOAD_LABEL)
    assert bed is not None and load is not None
    return bed.mask_areas, load.mask_areas


def test_parse_documented_video_frame() -> None:
    dets = parse_segmentation(DOC_FRAME + "\n", media_kind="video")
    assert [(d.frame, d.object_id) for d in dets] == [(0, "0"), (0, "1")]
    first = dets[0]
    assert first.box == Box(211, 228, 271, 255)  # right/bottom are exclusive
    assert first.mask is not None and (first.mask.width, first.mask.height) == (60, 27)
    assert first.mask_origin == (211, 228)
    assert first.media_size == (320, 334)


def test_parse_empty_output_is_no_detections() -> None:
    assert parse_segmentation("", media_kind="video") == []
    assert parse_segmentation("  \n", media_kind="image") == []


def test_process_parser_returns_same_detections() -> None:
    expected = parse_segmentation(DOC_FRAME, media_kind="video")
    sam_measure.configure_parse_executor(2)
    try:
        actual = asyncio.run(parse_segmentation_async(DOC_FRAME, media_kind="video"))
    finally:
        asyncio.run(sam_measure.shutdown_parse_executor())
    assert actual == expected


def test_opening_stops_at_the_tailgate_rim() -> None:
    m = measure_frame(_det(0, "b", BED), [], [_det(0, "t", RIM)])
    assert m.rim_from_tailgate and m.rim_y == 160
    assert m.opening_px == 200 * 60  # the tailgate face is not in the opening


def test_without_a_tailgate_the_whole_bed_is_the_opening() -> None:
    m = measure_frame(_det(0, "b", BED), [], [])
    assert not m.rim_from_tailgate
    assert m.opening_px == 200 * 100


def test_a_tailgate_near_the_top_of_the_bed_is_not_a_rim() -> None:
    high = (100, 105, 300, 200)  # starts in the top quarter: not the rear rim
    assert not measure_frame(_det(0, "b", BED), [], [_det(0, "t", high)]).rim_from_tailgate


def test_coverage_is_load_over_the_opening() -> None:
    load = [_det(0, "l", (120, 110, 280, 150))]  # 160 x 40 = 6,400 px
    result = measure(
        [_det(0, "b", BED)], load, media_kind="video", max_frames=10, rim_run=[_det(0, "t", RIM)]
    )
    beds, loads = _load(result)
    assert beds == [12000.0]
    assert loads == [pytest.approx(6400.0)]
    assert result.load_source == LOAD_SEGMENTED
    assert result.measure_version == MEASURE_VERSION


def test_load_heaped_above_the_front_rim_counts_up_to_a_full_bed() -> None:
    heaped = [_det(0, "l", (100, 60, 300, 160))]  # fills the opening and rises 40 px
    result = measure(
        [_det(0, "b", BED)], heaped, media_kind="video", max_frames=10, rim_run=[_det(0, "t", RIM)]
    )
    beds, loads = _load(result)
    assert loads[0] == beds[0]  # capped at a full bed


def test_load_outside_the_bed_is_ignored() -> None:
    ground = [_det(0, "g", (320, 150, 400, 260))]  # beside the truck
    result = measure(
        [_det(0, "b", BED)], ground, media_kind="video", max_frames=10, rim_run=[_det(0, "t", RIM)]
    )
    assert _load(result)[1] == [0.0]
    assert result.load_source == LOAD_NONE


def test_no_load_phrase_match_reads_none_not_a_guess() -> None:
    result = measure([_det(0, "b", BED)], [], media_kind="video", max_frames=10)
    assert result.load_source == LOAD_NONE
    assert _load(result)[1] == [0.0]


def test_measures_the_largest_bed_track() -> None:
    bed = [
        _det(0, "small", (10, 10, 30, 20)),
        _det(0, "big", BED),
        _det(1, "big", BED),
    ]
    result = measure(bed, [], media_kind="video", max_frames=10)
    bed_obj = result.by_label(BED_LABEL)
    assert bed_obj is not None and bed_obj.sam_object_id == "bed-big"
    assert result.frame_count == 2


def test_cut_off_frames_are_skipped_when_whole_frames_remain() -> None:
    clipped = [_det(f, "b", (100, 100, 300, 999)) for f in range(2)]  # touches the bottom
    whole = [_det(f, "b", BED) for f in range(2, 6)]
    result = measure(clipped + whole, [], media_kind="video", max_frames=10)
    assert _load(result)[0] == [20000.0] * 4


def test_far_away_frames_are_skipped() -> None:
    near = [_det(f, "b", BED) for f in range(4)]
    far = [_det(f, "b", (100, 100, 130, 110)) for f in range(4, 8)]
    result = measure(near + far, [], media_kind="video", max_frames=10)
    assert len(_load(result)[0]) == 4


def test_frame_disagreement_is_reported_as_spread() -> None:
    bed = [_det(f, "b", BED) for f in range(4)]
    loads = [
        _det(0, "l", (100, 100, 300, 110)),
        _det(1, "l", (100, 100, 300, 120)),
        _det(2, "l", (100, 100, 300, 180)),
        _det(3, "l", (100, 100, 300, 190)),
    ]
    result = measure(bed, loads, media_kind="video", max_frames=10)
    assert result.coverage_spread > 0.5


def test_no_bed_means_no_objects() -> None:
    result = measure([], [_det(0, "l", (0, 0, 10, 10))], media_kind="video", max_frames=10)
    assert result.objects == []


def test_frames_are_evenly_sampled_to_the_cap() -> None:
    bed = [_det(f, "b", (0, 0, 10, 10)) for f in range(30)]
    result = measure(bed, [], media_kind="video", max_frames=4)
    assert len(_load(result)[0]) == 4


def test_frames_covered_spans_highest_index() -> None:
    assert frames_covered([_det(4, "1", (0, 0, 1, 1))], [_det(9, "2", (0, 0, 1, 1))]) == 10
    assert frames_covered([]) == 0


def test_measure_reads_decoded_mask_pixels() -> None:
    dets = parse_segmentation(DOC_FRAME, media_kind="image")
    result = measure([dets[0]], [dets[0]], media_kind="image", max_frames=10)
    beds, loads = _load(result)
    # The same mask as bed and load covers its own silhouette span almost fully.
    assert 0 < loads[0] <= beds[0]
    assert result.frame_count == 1


def test_remeasure_merges_every_stored_load_phrase(monkeypatch: pytest.MonkeyPatch) -> None:
    # Stand in for the parser: each stored text names the boxes it decodes to.
    parsed = {
        "bed": [_det(0, "b", BED)],
        "rim": [_det(0, "t", RIM)],
        "left": [_det(0, "l", (100, 100, 200, 160))],
        "right": [_det(0, "r", (200, 100, 300, 160))],
    }
    monkeypatch.setattr(
        sam_measure, "parse_segmentation", lambda text, media_kind: parsed.get(text, [])
    )
    stored = TrackResult(
        objects=[],
        frame_count=1,
        segments={
            BED_LABEL: "bed",
            RIM_LABEL: "rim",
            LOAD_LABEL: "left",
            f"{LOAD_PREFIX}debris pile": "left",
            f"{LOAD_PREFIX}pile": "right",
        },
    )
    result = remeasure(stored, media_kind="video", max_frames=10)
    beds, loads = _load(result)
    assert loads[0] == beds[0]  # both halves merged: the opening is full
    assert result.segments == stored.segments  # the overlay data is kept
