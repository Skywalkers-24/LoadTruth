"""Persist the administrator's fresh-analysis choice through queue recovery."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_analysis_job_bypass_cache"
down_revision = "0004_demo_videos_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fresh installs create current ORM metadata in earlier migrations.
    if any(
        c["name"] == "bypass_cache" for c in sa.inspect(op.get_bind()).get_columns("analysis_jobs")
    ):
        return
    op.add_column(
        "analysis_jobs",
        sa.Column("bypass_cache", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("analysis_jobs", "bypass_cache")
