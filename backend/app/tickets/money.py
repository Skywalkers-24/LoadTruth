"""Deterministic load-ticket money math (PLAN.md §7a).

Pure functions, no I/O, no model calls. These compute cubic yards and dollar
values for both LoadTruth's measured estimate and the human monitor's call, then
the signed delta between them — the number that goes on screen in the demo.

Sign convention for the delta: ``monitor - LoadTruth``.
  * delta > 0  → the monitor's call is HIGHER than LoadTruth measured
                 → potential OVERBILLING (the money story).
  * delta < 0  → the monitor under-called.
  * delta == 0 → agreement.

Money uses ``Decimal`` so dollar values are exact to the cent; percentages and
cubic yards use ``Decimal`` too, to avoid binary-float drift in the chain.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# Accepted numeric inputs. Strings are allowed so callers can pass exact decimal
# literals (e.g. "3.015") without binary-float drift; _d normalizes all of them.
Number = Decimal | int | float | str

_CENTS = Decimal("0.01")
_CY = Decimal("0.001")  # cubic yards kept to 3 dp before display rounding
_PCT = Decimal("0.01")  # fill % normalized to 2 dp for consistent display
_HUNDRED = Decimal("100")


def _d(value: Number) -> Decimal:
    """Coerce to Decimal without inheriting binary-float noise."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


def cubic_yards(certified_cubic_yards: Number, fill_pct: Number) -> Decimal:
    """Credited volume = certified capacity x (fill % / 100).

    This mirrors the documented FEMA/Esri workflow (Research.md §3): it is an
    *estimated credited volume*, not a physical measurement.
    """
    cert = _d(certified_cubic_yards)
    pct = _d(fill_pct)
    if cert < 0:
        raise ValueError("certified_cubic_yards must be non-negative")
    if not (Decimal(0) <= pct <= _HUNDRED):
        raise ValueError("fill_pct must be between 0 and 100")
    return (cert * pct / _HUNDRED).quantize(_CY, rounding=ROUND_HALF_UP)


def dollar_value(cy: Number, rate_per_cy: Number) -> Decimal:
    """Dollar value = cubic yards x rate ($/CY), rounded to the cent."""
    cy_d = _d(cy)
    rate = _d(rate_per_cy)
    if rate < 0:
        raise ValueError("rate_per_cy must be non-negative")
    return (cy_d * rate).quantize(_CENTS, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class TicketValuation:
    """Both valuations plus the signed delta — the shape the UI/ticket renders."""

    certified_cubic_yards: Decimal
    rate_per_cy: Decimal

    est_fill_pct: Decimal
    est_cubic_yards: Decimal
    est_dollar_value: Decimal

    monitor_fill_pct: Decimal | None
    monitor_cubic_yards: Decimal | None
    monitor_dollar_value: Decimal | None

    delta_cubic_yards: Decimal | None
    delta_dollar_value: Decimal | None

    @property
    def is_overbill(self) -> bool:
        """True when the monitor's call exceeds LoadTruth's measurement."""
        return self.delta_dollar_value is not None and self.delta_dollar_value > 0


def value_ticket(
    *,
    certified_cubic_yards: Number,
    rate_per_cy: Number,
    est_fill_pct: Number,
    monitor_fill_pct: Number | None = None,
) -> TicketValuation:
    """Compute LoadTruth's estimate, the monitor's call, and the signed delta.

    ``monitor_fill_pct`` is optional: a ticket starts as a draft with only the
    machine estimate, and the monitor's call (and thus the delta) is filled in
    at review time. When it is ``None`` the monitor/delta fields are ``None``.
    """
    cert = _d(certified_cubic_yards)
    rate = _d(rate_per_cy)

    est_pct = _d(est_fill_pct).quantize(_PCT, rounding=ROUND_HALF_UP)
    est_cy = cubic_yards(cert, est_pct)
    est_dollars = dollar_value(est_cy, rate)

    mon_pct: Decimal | None = None
    mon_cy: Decimal | None = None
    mon_dollars: Decimal | None = None
    delta_cy: Decimal | None = None
    delta_dollars: Decimal | None = None

    if monitor_fill_pct is not None:
        mon_pct = _d(monitor_fill_pct).quantize(_PCT, rounding=ROUND_HALF_UP)
        mon_cy = cubic_yards(cert, mon_pct)
        mon_dollars = dollar_value(mon_cy, rate)
        delta_cy = (mon_cy - est_cy).quantize(_CY, rounding=ROUND_HALF_UP)
        delta_dollars = (mon_dollars - est_dollars).quantize(_CENTS, rounding=ROUND_HALF_UP)

    return TicketValuation(
        certified_cubic_yards=cert,
        rate_per_cy=rate,
        est_fill_pct=est_pct,
        est_cubic_yards=est_cy,
        est_dollar_value=est_dollars,
        monitor_fill_pct=mon_pct,
        monitor_cubic_yards=mon_cy,
        monitor_dollar_value=mon_dollars,
        delta_cubic_yards=delta_cy,
        delta_dollar_value=delta_dollars,
    )
