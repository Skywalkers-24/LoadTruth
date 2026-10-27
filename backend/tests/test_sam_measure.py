"""SAM 3.1 output -> Stage-5 measurements (app/ai/sam_measure.py). No network."""

from __future__ import annotations

from app.ai.sam_measure import (
    BED_LABEL,
    LOAD_LABEL,
    Box,
    Detection,
    frames_covered,
    measure,
    parse_segmentation,
)

# Two records copied from dev.meta.ai/docs/sam/reading-segmentation (lossless masks).
MASK_0 = "~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x("
MASK_1 = "~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@"
DOC_FRAME = (
    f"<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,{MASK_0}|>"
    f",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,48,{MASK_1}|>"
)


def _det(frame: int, oid: str, left: int, top: int, right: int, bottom: int) -> Detection:
    return Detection(frame, oid, Box(left, top, right, bottom))


def test_parse_documented_video_frame() -> None:
    dets = parse_segmentation(DOC_FRAME + "\n", media_kind="video")
    assert [(d.frame, d.object_id) for d in dets] == [(0, "0"), (0, "1")]
    first = dets[0]
    assert first.box == Box(211, 228, 271, 255)  # right/bottom are exclusive
    assert first.mask is not None and (first.mask.width, first.mask.height) == (60, 27)
    assert first.mask_origin == (211, 228)


def test_parse_empty_output_is_no_detections() -> None:
    assert parse_segmentation("", media_kind="video") == []
    assert parse_segmentation("  \n", media_kind="image") == []


def test_measure_uses_decoded_mask_pixels() -> None:
    dets = parse_segmentation(DOC_FRAME, media_kind="image")
    bed = [dets[0]]
    result = measure(bed, bed, media_kind="image", max_frames=10)
    bed_obj, load_obj = result.by_label(BED_LABEL), result.by_label(LOAD_LABEL)
    assert bed_obj is not None and load_obj is not None
    # The mask fills most, not all, of its 60x27 box.
    assert 0 < bed_obj.mask_areas[0] < 60 * 27
    # The same mask as the load sits fully inside the bed span.
    assert load_obj.mask_areas == bed_obj.mask_areas
    assert load_obj.load_height_ratio == 1.0
    assert result.frame_count == 1


def test_measure_box_geometry_coverage_and_height() -> None:
    bed = [_det(0, "1", 100, 100, 300, 200)]  # 200 x 100
    load = [_det(0, "7", 120, 150, 280, 200)]  # 160 x 50 inside the span
    result = measure(bed, load, media_kind="video", max_frames=10)
    bed_obj, load_obj = result.by_label(BED_LABEL), result.by_label(LOAD_LABEL)
    assert bed_obj is not None and load_obj is not None
    assert bed_obj.mask_areas == [20000.0]
    assert load_obj.mask_areas == [8000.0]
    assert load_obj.load_height_ratio == 0.5


def test_load_outside_the_bed_span_is_ignored() -> None:
    bed = [_det(0, "1", 100, 100, 300, 200)]
    ground = [_det(0, "2", 320, 150, 400, 260)]  # beside the truck
    result = measure(bed, ground, media_kind="video", max_frames=10)
    load_obj = result.by_label(LOAD_LABEL)
    assert load_obj is not None
    assert load_obj.mask_areas == [0.0]
    assert load_obj.load_height_ratio == 0.0


def test_heaped_load_above_rails_counts_and_caps_height() -> None:
    bed = [_det(0, "1", 100, 100, 300, 200)]
    heaped = [_det(0, "2", 100, 60, 300, 200)]  # rises 40 px above the top of the bed
    load_obj = measure(bed, heaped, media_kind="video", max_frames=10).by_label(LOAD_LABEL)
    assert load_obj is not None
    assert load_obj.mask_areas == [200.0 * 140]
    assert load_obj.load_height_ratio == 1.0


def test_measures_the_largest_bed_track() -> None:
    bed = [
        _det(0, "small", 10, 10, 30, 20),
        _det(0, "big", 100, 100, 300, 200),
        _det(1, "big", 100, 100, 300, 200),
    ]
    result = measure(bed, [], media_kind="video", max_frames=10)
    bed_obj = result.by_label(BED_LABEL)
    assert bed_obj is not None
    assert bed_obj.sam_object_id == "bed-big"
    assert bed_obj.mask_areas == [20000.0, 20000.0]
    assert result.frame_count == 2


def test_no_bed_means_no_objects() -> None:
    result = measure([], [_det(0, "2", 0, 0, 10, 10)], media_kind="video", max_frames=10)
    assert result.objects == []


def test_frames_are_evenly_sampled_to_the_cap() -> None:
    bed = [_det(f, "1", 0, 0, 10, 10) for f in range(30)]
    bed_obj = measure(bed, [], media_kind="video", max_frames=4).by_label(BED_LABEL)
    assert bed_obj is not None and len(bed_obj.mask_areas) == 4


def test_frames_covered_spans_highest_index() -> None:
    assert frames_covered([_det(4, "1", 0, 0, 1, 1)], [_det(9, "2", 0, 0, 1, 1)]) == 10
    assert frames_covered([]) == 0
