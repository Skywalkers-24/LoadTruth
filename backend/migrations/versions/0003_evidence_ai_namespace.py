"""Pin evidence replay to its provider/model configuration cache namespace."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_evidence_ai_namespace"
down_revision = "0002_event_tags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The initial non-Supabase migration creates current ORM metadata.
    if any(
        c["name"] == "ai_cache_namespace"
        for c in sa.inspect(op.get_bind()).get_columns("ticket_evidence")
    ):
        return
    op.add_column("ticket_evidence", sa.Column("ai_cache_namespace", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("ticket_evidence", "ai_cache_namespace")
