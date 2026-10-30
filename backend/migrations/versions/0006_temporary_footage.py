"""Retain tickets independently of optional footage storage."""

import sqlalchemy as sa
from alembic import op

revision = "0006_temporary_footage"
down_revision = "0005_analysis_job_bypass_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, column in [
        (
            "ticket_evidence",
            sa.Column("media_storage", sa.String(8), nullable=False, server_default="b2"),
        ),
        (
            "analysis_jobs",
            sa.Column("keep_footage", sa.Boolean(), nullable=False, server_default=sa.true()),
        ),
    ]:
        if column.name not in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}:
            op.add_column(table, column)


def downgrade() -> None:
    op.drop_column("analysis_jobs", "keep_footage")
    op.drop_column("ticket_evidence", "media_storage")
