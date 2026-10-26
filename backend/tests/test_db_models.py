"""Metadata tests for the ORM layer (no live database required).

These assert the declarative models match infra/rbac/20_loadtruth_schema.sql:
the right table, the tenant/pk/timestamp mixin columns, and the money/percent
columns with their precision. They catch schema drift between the ORM and the
SQL migration early, and they exercise the declarations so the gate is honest.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Numeric

from app.db.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.models import Ticket


def test_ticket_maps_to_tickets_table() -> None:
    assert Ticket.__tablename__ == "tickets"
    assert Ticket.__table__ in Base.metadata.tables.values()


def test_ticket_has_mixin_columns() -> None:
    cols = Ticket.__table__.columns
    # From the three shared mixins.
    assert "id" in cols and cols["id"].primary_key
    assert "tenant_id" in cols and not cols["tenant_id"].nullable
    assert "created_at" in cols and not cols["created_at"].nullable


def test_ticket_money_columns_precision() -> None:
    cols = Ticket.__table__.columns
    # Dollars: Numeric(12, 2); cubic yards: Numeric(10, 3); percent: Numeric(5, 2).
    usd = cols["est_dollar_value"].type
    cy = cols["est_cubic_yards"].type
    pct = cols["est_fill_pct"].type
    assert isinstance(usd, Numeric) and (usd.precision, usd.scale) == (12, 2)
    assert isinstance(cy, Numeric) and (cy.precision, cy.scale) == (10, 3)
    assert isinstance(pct, Numeric) and (pct.precision, pct.scale) == (5, 2)


def test_ticket_nullable_monitor_and_delta_fields() -> None:
    cols = Ticket.__table__.columns
    # Monitor call + delta are filled at review time, so they must be nullable.
    for name in (
        "monitor_call_fill_pct",
        "monitor_dollar_value",
        "delta_cubic_yards",
        "delta_dollar_value",
    ):
        assert cols[name].nullable, f"{name} should be nullable (set at review)"


def test_ticket_status_defaults_to_draft() -> None:
    # A ticket is a draft until a human confirms (human-in-the-loop safeguard).
    default = Ticket.__table__.columns["status"].default
    assert default is not None
    assert default.arg == "draft"


def test_mixins_are_distinct_and_importable() -> None:
    # Guard against accidental removal/rename of the shared mixins.
    assert {UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin}
    assert issubclass(Ticket, UUIDPrimaryKeyMixin)
    assert issubclass(Ticket, TenantScopedMixin)


def test_certified_capacity_default_is_decimal() -> None:
    # Rate defaults to Decimal(0); certified CY is required (no default).
    cols = Ticket.__table__.columns
    assert cols["rate_per_cy"].default is not None
    assert cols["rate_per_cy"].default.arg == Decimal(0)
