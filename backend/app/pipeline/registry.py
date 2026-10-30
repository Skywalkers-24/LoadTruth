"""Stage 4 — certified-truck capacity lookup (PLAN.md §5).

Matches an OCR'd truck id against the tenant's certified-truck registry and
returns the certified capacity + body type. OCR is noisy, so the match is fuzzy:
exact first, then a normalized-id match (strip separators/case), then a close
edit-distance match. A match below the confidence floor is treated as "unknown"
so the anomaly engine can flag it rather than silently guessing.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from difflib import SequenceMatcher


@dataclass(frozen=True, slots=True)
class CertifiedTruck:
    truck_number: str
    certified_cubic_yards: Decimal
    body_type: str


@dataclass(frozen=True, slots=True)
class CapacityMatch:
    truck: CertifiedTruck | None
    matched_id: str | None
    confidence: float

    @property
    def found(self) -> bool:
        return self.truck is not None


_MATCH_FLOOR = 0.8


def _normalize(truck_id: str) -> str:
    return "".join(ch for ch in truck_id.upper() if ch.isalnum())


class TruckRegistry:
    """Tenant's certified trucks, with fuzzy lookup over OCR noise."""

    def __init__(self, trucks: list[CertifiedTruck]) -> None:
        self._by_norm: dict[str, CertifiedTruck] = {_normalize(t.truck_number): t for t in trucks}

    @property
    def has_certifications(self) -> bool:
        return bool(self._by_norm)

    def lookup(self, ocr_truck_id: str | None) -> CapacityMatch:
        if not ocr_truck_id:
            return CapacityMatch(truck=None, matched_id=None, confidence=0.0)

        norm = _normalize(ocr_truck_id)
        exact = self._by_norm.get(norm)
        if exact is not None:
            return CapacityMatch(truck=exact, matched_id=exact.truck_number, confidence=1.0)

        # Fuzzy: best normalized similarity across the registry.
        best: CertifiedTruck | None = None
        best_score = 0.0
        for key, truck in self._by_norm.items():
            score = SequenceMatcher(None, norm, key).ratio()
            if score > best_score:
                best_score, best = score, truck

        if best is not None and best_score >= _MATCH_FLOOR:
            return CapacityMatch(truck=best, matched_id=best.truck_number, confidence=best_score)
        return CapacityMatch(truck=None, matched_id=None, confidence=round(best_score, 3))
