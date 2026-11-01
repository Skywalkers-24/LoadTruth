#!/usr/bin/env python3
"""Generate multi-quality video variants (low, medium, high) for all public videos.

Tiers:
- Low (480p, CRF 26, faststart): ~300-500 KB, fast instantaneous start on mobile/2G/3G.
- Medium (720p, CRF 24, faststart): ~1.2-1.5 MB, high-definition balanced playback for 4G.
- High: Original master clip, 1080p/720p maximum fidelity.

Usage:
    python3 scripts/generate_video_variants.py
"""

from concurrent.futures import ThreadPoolExecutor
import glob
import os
from pathlib import Path
import subprocess
import sys
import time

VIDEO_DIR = Path("frontend/public/videos")


def encode_variant(task: tuple[str, str, int, str]) -> tuple[str, int, float, bool]:
    src, scale, crf, dst = task
    dst_path = Path(dst)
    if dst_path.exists() and dst_path.stat().st_size > 50_000:
        return dst, dst_path.stat().st_size, 0.0, True

    t0 = time.time()
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        src,
        "-vf",
        f"scale={scale}",
        "-c:v",
        "libx264",
        "-crf",
        str(crf),
        "-preset",
        "fast",
        "-an",
        "-movflags",
        "+faststart",
        dst,
    ]
    try:
        subprocess.run(cmd, check=True)
        size = dst_path.stat().st_size
        return dst, size, time.time() - t0, False
    except subprocess.CalledProcessError as err:
        print(f"Error encoding {dst}: {err}", file=sys.stderr)
        return dst, 0, time.time() - t0, False


def main() -> None:
    if not VIDEO_DIR.exists():
        print(f"Directory {VIDEO_DIR} does not exist.", file=sys.stderr)
        sys.exit(1)

    all_mp4s = sorted(glob.glob(str(VIDEO_DIR / "*.mp4")))
    masters = [
        f
        for f in all_mp4s
        if not f.endswith("-low.mp4")
        and not f.endswith("-med.mp4")
        and not f.endswith("-high.mp4")
        and not Path(f).name.startswith("showcase-")
    ]

    print(f"Found {len(masters)} master videos in {VIDEO_DIR}.")

    tasks: list[tuple[str, str, int, str]] = []
    for master in masters:
        dst_low = master.replace(".mp4", "-low.mp4")
        dst_med = master.replace(".mp4", "-med.mp4")
        tasks.append((master, "-2:480", 26, dst_low))
        tasks.append((master, "-2:720", 24, dst_med))

    print(f"Queueing {len(tasks)} encoding tasks across parallel workers...")
    t_start = time.time()
    completed = 0
    total_low_bytes = 0
    total_med_bytes = 0
    total_master_bytes = sum(os.path.getsize(m) for m in masters)

    with ThreadPoolExecutor(max_workers=8) as ex:
        for dst, size, elapsed, cached in ex.map(encode_variant, tasks):
            completed += 1
            is_low = dst.endswith("-low.mp4")
            if is_low:
                total_low_bytes += size
            else:
                total_med_bytes += size
            status = "Cached" if cached else f"Encoded in {elapsed:.1f}s"
            if completed % 10 == 0 or completed == len(tasks):
                print(
                    f"[{completed}/{len(tasks)}] {Path(dst).name}: {size / 1024:.1f} KB ({status})"
                )

    total_time = time.time() - t_start
    print("\n=== Multi-Quality Video Summary ===")
    print(f"Masters: {total_master_bytes / (1024 * 1024):.1f} MB total ({len(masters)} clips)")
    print(
        f"Low Tier (480p): {total_low_bytes / (1024 * 1024):.1f} MB total "
        f"({(total_low_bytes / max(1, total_master_bytes)) * 100:.1f}% of master size, ~{total_low_bytes / max(1, len(masters)) / 1024:.0f} KB/clip)"
    )
    print(
        f"Medium Tier (720p): {total_med_bytes / (1024 * 1024):.1f} MB total "
        f"({(total_med_bytes / max(1, total_master_bytes)) * 100:.1f}% of master size, ~{total_med_bytes / max(1, len(masters)) / 1024:.0f} KB/clip)"
    )
    print(f"Total time elapsed: {total_time:.1f}s")


if __name__ == "__main__":
    main()

