"""Evidence receipt: a reproducible fingerprint of how a ticket's number was made.

The pitch is "a number anyone can reproduce, from the video, in one click." The
receipt is the artifact that makes that literal. It is a SHA-256 over a canonical
record of every input that determined the result:

  * the clip's content hash (the exact bytes the models saw);
  * a hash of SAM's stored segmentation output and the measured mask areas;
  * Muse's stored per-frame fill estimates and the median source selection;
  * the placard read and debris class the perception models returned;
  * the deterministic geometry inputs and the fill %, cubic yards, and dollars;
  * the model versions and the config constants that governed the math.

Re-verification combines the stored Muse estimates with the same median as
ingestion (or replays SAM geometry for legacy/fixture results), then rebuilds
the receipt without a model call.

Nothing here calls a model or touches the network. It is pure, so it is cheap to
run on demand and trivial to test.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

# Bump when the canonical receipt shape changes, so an old receipt is detectably
# from an older format rather than silently "not matching."
# "2": bed_area is the bed opening above the tailgate rim (measurement v2).
RECEIPT_VERSION = "3"


@dataclass(frozen=True, slots=True)
class ReceiptInputs:
    """The pinned inputs that fully determine a ticket's measured number.

    Every field is either content-addressed (a hash) or a deterministic value, so
    two runs over the same evidence produce byte-identical inputs, hence the same
    receipt hash.
    """

    content_hash: str  # SHA-256 of the exact media bytes the models saw
    sam_output_hash: str  # SHA-256 of SAM's stored raw segmentation text
    bed_area: float  # averaged bed-opening area above the tailgate rim (px)
    load_area: float  # averaged load area inside the opening (px)
    load_height_ratio: float  # depth term the coverage stands for (0..1)
    body_type: str | None  # matched truck body type (pinned for the audit trail)
    truck_id: str | None  # placard read
    debris_class: str  # classified load class
    certified_cubic_yards: str  # registry capacity (Decimal as string)
    rate_per_cy: str  # $/CY applied (Decimal as string)
    est_fill_pct: str  # the measured fill % (Decimal as string)
    est_cubic_yards: str  # derived volume (Decimal as string)
    est_dollar_value: str  # derived dollars (Decimal as string)
    sam_model: str  # e.g. sam-3.1
    spark_model: str  # e.g. muse-spark-1.3
    fill_source: str = "sam_mask_coverage"
    muse_frame_fill_pcts: list[float] = field(default_factory=list)

    def canonical(self) -> dict[str, Any]:
        """A stable, JSON-serializable mapping (sorted keys on dump)."""
        return {
            "version": RECEIPT_VERSION,
            "content_hash": self.content_hash,
            "sam_output_hash": self.sam_output_hash,
            "bed_area": round(self.bed_area, 3),
            "load_area": round(self.load_area, 3),
            "load_height_ratio": round(self.load_height_ratio, 4),
            "body_type": self.body_type or "",
            "truck_id": self.truck_id or "",
            "debris_class": self.debris_class,
            "certified_cubic_yards": self.certified_cubic_yards,
            "rate_per_cy": self.rate_per_cy,
            "est_fill_pct": self.est_fill_pct,
            "est_cubic_yards": self.est_cubic_yards,
            "est_dollar_value": self.est_dollar_value,
            "sam_model": self.sam_model,
            "spark_model": self.spark_model,
            "fill_source": self.fill_source,
            "muse_frame_fill_pcts": [round(value, 2) for value in self.muse_frame_fill_pcts],
        }


@dataclass(frozen=True, slots=True)
class Receipt:
    """A computed receipt: the canonical inputs plus their SHA-256 digest."""

    receipt_hash: str
    inputs: dict[str, Any] = field(default_factory=dict)


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sam_output_hash(segments: dict[str, str]) -> str:
    """Stable hash of SAM's stored raw output across both concepts.

    Keys are sorted so the hash does not depend on dict ordering. An empty map
    (older rows that didn't keep raw output) hashes to a fixed sentinel.
    """
    if not segments:
        return _sha256_text("no-sam-output")
    canonical = json.dumps(segments, sort_keys=True, separators=(",", ":"))
    return _sha256_text(canonical)


def compute_receipt(inputs: ReceiptInputs) -> Receipt:
    """Hash the canonical inputs into a stable receipt digest."""
    canonical = inputs.canonical()
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return Receipt(receipt_hash=_sha256_text(payload), inputs=canonical)


def _d(value: Decimal | None) -> str:
    """Decimal to a canonical string (``""`` for None)."""
    return "" if value is None else str(value)
