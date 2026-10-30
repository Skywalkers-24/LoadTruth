"""Provider evidence pinning must work on fresh and existing installations."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.db.base import Base


@pytest.mark.parametrize("existing", [False, True])
def test_migrate_to_provider_evidence_namespace(existing: bool) -> None:
    engine = create_engine("sqlite://")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        if existing:
            Base.metadata.create_all(connection)
            connection.execute(text("ALTER TABLE ticket_evidence DROP COLUMN ai_cache_namespace"))
            connection.execute(text("ALTER TABLE events DROP COLUMN tags"))
            command.stamp(config, "0001_initial")
        command.upgrade(config, "head")
        command.upgrade(config, "head")
        columns = {col["name"] for col in inspect(connection).get_columns("ticket_evidence")}
        assert "ai_cache_namespace" in columns
        assert {"demo_videos", "analysis_jobs"}.issubset(inspect(connection).get_table_names())
        assert "tags" in {col["name"] for col in inspect(connection).get_columns("events")}
    engine.dispose()


def test_existing_analysis_jobs_default_to_cache_reuse() -> None:
    engine = create_engine("sqlite://")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        Base.metadata.create_all(connection)
        connection.execute(text("ALTER TABLE analysis_jobs DROP COLUMN bypass_cache"))
        connection.execute(text("ALTER TABLE analysis_jobs DROP COLUMN keep_footage"))
        connection.execute(text("ALTER TABLE ticket_evidence DROP COLUMN media_storage"))
        connection.execute(
            text(
                "INSERT INTO analysis_jobs (id,tenant_id,event_id,video_id,status,created_at) "
                "VALUES ('job','tenant','event','video','queued',CURRENT_TIMESTAMP)"
            )
        )
        command.stamp(config, "0004_demo_videos_jobs")
        command.upgrade(config, "head")
        assert (
            connection.execute(
                text("SELECT keep_footage FROM analysis_jobs WHERE id='job'")
            ).scalar()
            == 1
        )
        assert "media_storage" in {
            c["name"] for c in inspect(connection).get_columns("ticket_evidence")
        }
        assert (
            connection.execute(
                text("SELECT bypass_cache FROM analysis_jobs WHERE id='job'")
            ).scalar()
            == 0
        )
    engine.dispose()
