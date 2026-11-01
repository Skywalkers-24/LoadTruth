#!/usr/bin/env python3
"""Generate a video with real Meta SAM 3.1 masks burned in for benchmark-003.

This produces:
- frontend/public/videos/benchmark-003-masked.mp4
- frontend/public/videos/thumbnails/benchmark-003-masked.jpg

Zero browser/server JS overhead, perfect 60fps/24fps playback, no Cloudflare Worker resource limit issues.
"""

import json
import os
import subprocess
import sys
import cv2
import numpy as np
from meta_sam_parser import video_segmentation_format, decode_mask_to_raster

VIDEO_IN = "frontend/public/videos/benchmark-003-d7013b49d647.mp4"
EVIDENCE_IN = "frontend/public/evidence/benchmark/003.json"
VIDEO_OUT = "frontend/public/videos/benchmark-003-masked.mp4"
THUMB_OUT = "frontend/public/videos/thumbnails/benchmark-003-masked.jpg"

def load_sam_tracks(evidence_path):
    with open(evidence_path, "r") as f:
        ev = json.load(f)

    fmt = video_segmentation_format()

    def parse_track(label):
        text = ev.get("segments", {}).get(label, "")
        if not text:
            return {}
        parser = fmt.create_parser()
        parser.push(text + "\n", emit=False)
        res = parser.finish({"status": "completed"})
        frames = {}
        for r in res.result.records:
            if getattr(r, "kind", None) == "mask" and r.frame is not None:
                f_idx = getattr(r.frame, "frame_index", getattr(r.frame, "frameIndex", 0))
                raster_bytes = decode_mask_to_raster(r.mask)
                b = r.bounds
                w = b.right - b.left
                h = b.bottom - b.top
                if len(raster_bytes) == w * h and w > 0 and h > 0:
                    mask = np.frombuffer(raster_bytes, dtype=np.uint8).reshape((h, w))
                    frames.setdefault(f_idx, []).append((b, mask))
        return frames

    print("Parsing SAM 3.1 truck bed...")
    beds = parse_track("truck bed")
    print("Parsing SAM 3.1 truck body & tailgate...")
    body = parse_track("truck body")
    tailgate = parse_track("tailgate")
    for f_idx, items in tailgate.items():
        body.setdefault(f_idx, []).extend(items)
    print("Parsing SAM 3.1 debris pile & materials...")
    debris = parse_track("debris pile")
    for key in ev.get("segments", {}):
        if key.startswith("load: "):
            mat = parse_track(key)
            for f_idx, items in mat.items():
                debris.setdefault(f_idx, []).extend(items)

    return ev.get("fps", 5.984), beds, body, debris

def main():
    if not os.path.exists(VIDEO_IN):
        print(f"Error: {VIDEO_IN} not found")
        sys.exit(1)

    sam_fps, beds, body, debris = load_sam_tracks(EVIDENCE_IN)

    cap = cv2.VideoCapture(VIDEO_IN)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 240

    print(f"Video: {width}x{height} @ {video_fps}fps, {total_frames} frames. SAM fps: {sam_fps}")

    scale_x = width / 1024.0
    scale_y = height / 576.0

    temp_raw_avi = "scratch/temp_masked.avi"
    os.makedirs("scratch", exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    out = cv2.VideoWriter(temp_raw_avi, fourcc, video_fps, (width, height))

    saved_thumb = False
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        sam_frame = int(round(frame_idx * (sam_fps / video_fps)))

        # Create overlay layer
        overlay = frame.copy()

        # Real Console Colors:
        # 1. Truck Body & Tailgate: Amber / Orange #f59e0b -> BGR (11, 158, 245)
        # 2. Truck Bed: Cyan / Sky Blue #0284c7 -> BGR (199, 132, 2)
        # 3. Debris Pile / Load: Violet / Purple #8b5cf6 -> BGR (246, 92, 139)

        # 1. Truck Body (Amber #f59e0b)
        body_shapes = body.get(sam_frame, [])
        for b, m in body_shapes:
            x1, y1 = int(round(b.left * scale_x)), int(round(b.top * scale_y))
            x2, y2 = int(round(b.right * scale_x)), int(round(b.bottom * scale_y))
            if x2 > x1 and y2 > y1:
                resized = cv2.resize(m, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
                sub = overlay[y1:y2, x1:x2]
                mask_bool = resized > 0
                sub[mask_bool] = (sub[mask_bool] * 0.78 + np.array([11, 158, 245]) * 0.22).astype(np.uint8)
                contours, _ = cv2.findContours(resized, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cv2.drawContours(sub, contours, -1, (11, 158, 245), 2)

        # 2. Truck Bed (Cyan / Sky Blue #0284c7)
        bed_shapes = beds.get(sam_frame, [])
        for b, m in bed_shapes:
            x1, y1 = int(round(b.left * scale_x)), int(round(b.top * scale_y))
            x2, y2 = int(round(b.right * scale_x)), int(round(b.bottom * scale_y))
            if x2 > x1 and y2 > y1:
                resized = cv2.resize(m, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
                sub = overlay[y1:y2, x1:x2]
                mask_bool = resized > 0
                sub[mask_bool] = (sub[mask_bool] * 0.75 + np.array([199, 132, 2]) * 0.25).astype(np.uint8)
                contours, _ = cv2.findContours(resized, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cv2.drawContours(sub, contours, -1, (199, 132, 2), 2)

        # 3. Debris Pile / Load (Violet / Purple #8b5cf6, prominent)
        debris_shapes = debris.get(sam_frame, [])
        for b, m in debris_shapes:
            x1, y1 = int(round(b.left * scale_x)), int(round(b.top * scale_y))
            x2, y2 = int(round(b.right * scale_x)), int(round(b.bottom * scale_y))
            if x2 > x1 and y2 > y1:
                resized = cv2.resize(m, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
                sub = overlay[y1:y2, x1:x2]
                mask_bool = resized > 0
                sub[mask_bool] = (sub[mask_bool] * 0.62 + np.array([246, 92, 139]) * 0.38).astype(np.uint8)
                contours, _ = cv2.findContours(resized, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cv2.drawContours(sub, contours, -1, (246, 92, 139), 2)

        # Overlay HUD tags on frame
        # Top-left badge: SAM 3.1 ACTIVE
        cv2.rectangle(overlay, (24, 24), (190, 56), (0, 0, 0), -1)
        cv2.putText(overlay, "SAM 3.1 ACTIVE", (34, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (199, 132, 2), 2, cv2.LINE_AA)
        
        # FPS badge
        cv2.rectangle(overlay, (200, 24), (390, 56), (0, 0, 0), -1)
        cv2.putText(overlay, "FPS: 5.98 | 1280x720", (210, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (220, 220, 220), 1, cv2.LINE_AA)

        # Bottom-left hash
        cv2.rectangle(overlay, (24, height - 56), (280, height - 24), (0, 0, 0), -1)
        cv2.putText(overlay, "SHA-256: d7013b49d647...", (34, height - 36), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

        # Right-bottom fill tag
        cv2.rectangle(overlay, (width - 240, height - 56), (width - 24, height - 24), (0, 0, 0), -1)
        cv2.putText(overlay, "FL-DT-1182: 51.6% Fill", (width - 230, height - 36), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (246, 92, 139), 2, cv2.LINE_AA)

        out.write(overlay)

        if not saved_thumb and frame_idx == 40:
            cv2.imwrite(THUMB_OUT, overlay)
            saved_thumb = True

        frame_idx += 1

    cap.release()
    out.release()

    if not saved_thumb:
        cv2.imwrite(THUMB_OUT, overlay)

    print("Encoding final H.264 MP4 with ffmpeg...")
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        temp_raw_avi,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "21",
        "-preset",
        "fast",
        "-an",
        "-movflags",
        "+faststart",
        VIDEO_OUT,
    ]
    subprocess.run(cmd, check=True)
    if os.path.exists(temp_raw_avi):
        os.remove(temp_raw_avi)

    size = os.path.getsize(VIDEO_OUT)
    print(f"Generated {VIDEO_OUT} ({size / 1_000_000:.2f} MB)")
    print(f"Generated {THUMB_OUT}")

if __name__ == "__main__":
    main()
