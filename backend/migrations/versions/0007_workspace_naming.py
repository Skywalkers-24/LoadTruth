"""Apply the final LoadTruth workspace names and dataset metadata."""

from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from alembic import op

revision = "0007_workspace_naming"
down_revision = "0006_temporary_footage"
branch_labels = None
depends_on = None

_EVENTS = sa.table(
    "events",
    sa.column("id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("location", sa.String()),
    sa.column("status", sa.String()),
    sa.column("tags", sa.JSON()),
)

_WORKSPACES = (
    (
        "60cdc03c-ae67-4ff3-a482-6e6f08372dff",
        "Hurricane Debris Recovery 2026",
        "Pinellas County, FL",
        "active",
        ["dataset-1", "meta-processed-muse", "read-only"],
    ),
    (
        "9041997f-3d84-475a-863c-5efe36273d75",
        "Lahaina Wildfire Recovery 2023",
        "Maui County, HI",
        "archived",
        ["dataset-2", "meta-processed-muse", "read-only", "synthetic-demo"],
    ),
    (
        "5152264c-5a7f-485b-990b-6f8f23bcb7c4",
        "LoadTruth Demo",
        "Demonstration workspace",
        "active",
        ["admin-only"],
    ),
    (
        "7dcdd0cf-1e3b-434d-b163-85091762a376",
        "LoadTruth Sandbox",
        "Interactive training workspace",
        "active",
        ["playground", "saved-results"],
    ),
)


def upgrade() -> None:
    bind = op.get_bind()
    for event_id, name, location, status, tags in _WORKSPACES:
        bind.execute(
            sa.update(_EVENTS)
            .where(_EVENTS.c.id == UUID(event_id))
            .values(name=name, location=location, status=status, tags=tags)
        )


def downgrade() -> None:
    bind = op.get_bind()
    previous = (
        (
            "60cdc03c-ae67-4ff3-a482-6e6f08372dff",
            "Hurricane Debris Recovery 2026",
            "Pinellas County, FL",
            "active",
            ["benchmark", "read-only"],
        ),
        (
            "9041997f-3d84-475a-863c-5efe36273d75",
            "Hurricane Debris Recovery 2026",
            "Pinellas County, FL",
            "active",
            ["dataset-2", "meta-processed-muse", "read-only"],
        ),
        (
            "5152264c-5a7f-485b-990b-6f8f23bcb7c4",
            "LoadTruth Live Demonstration",
            "Demonstration workspace",
            "active",
            ["admin-only", "live-demo"],
        ),
        (
            "7dcdd0cf-1e3b-434d-b163-85091762a376",
            "LoadTruth Practice Playground",
            "Demonstration workspace",
            "active",
            ["playground", "saved-results"],
        ),
    )
    for event_id, name, location, status, tags in previous:
        bind.execute(
            sa.update(_EVENTS)
            .where(_EVENTS.c.id == UUID(event_id))
            .values(name=name, location=location, status=status, tags=tags)
        )
