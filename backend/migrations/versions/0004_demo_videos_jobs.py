"""Private B2 demo library and durable analysis jobs."""

from typing import Any, cast

from alembic import op

revision = "0004_demo_videos_jobs"
down_revision = "0003_evidence_ai_namespace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.models import AnalysisJob, DemoVideo

    cast(Any, DemoVideo.__table__).create(op.get_bind(), checkfirst=True)
    cast(Any, AnalysisJob.__table__).create(op.get_bind(), checkfirst=True)
    if op.get_bind().dialect.name == "postgresql":
        # Backend-owned tables: no anonymous/client-side database access.
        op.execute("ALTER TABLE demo_videos ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("analysis_jobs")
    op.drop_table("demo_videos")
