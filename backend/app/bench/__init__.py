"""Known-volume benchmark harness (Winner.md B1).

Independent ground truth, not agreement with the monitor. Each row in
``data_bench/ground_truth.csv`` names a clip with a *known* true fill % (from a
measured scale-model rig or a load bought by the cubic yard) plus the capture
conditions (material, angle, lighting). The harness runs the real pipeline over
each clip, compares the machine fill % to the known value, and reports the error
distribution overall and by condition.

This is the number that backs the accuracy claim. The monitor-agreement metric
(``app.tickets.repository``) is a different, complementary signal and is labeled
as such throughout the UI.
"""

from app.bench.harness import (
    BenchmarkReport,
    BenchmarkRow,
    GroundTruthRow,
    load_ground_truth,
    summarize,
)

__all__ = [
    "BenchmarkReport",
    "BenchmarkRow",
    "GroundTruthRow",
    "load_ground_truth",
    "summarize",
]
