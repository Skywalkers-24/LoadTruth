"""Add event tags for curated, read-only showcase datasets."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_event_tags"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The initial non-Supabase migration creates current ORM metadata.
    if any(c["name"] == "tags" for c in sa.inspect(op.get_bind()).get_columns("events")):
        return
    op.add_column(
        "events",
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("events", "tags")
