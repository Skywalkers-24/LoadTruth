"""Exercise spend/duplication guards without Docker, network or model calls."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


batch = load("benchmark_batch")
db = load("benchmark_db")
TICKET = "33333333-3333-3333-3333-333333333333"


class RunnerGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.manifest = {
            "base": "http://127.0.0.1:8000",
            "event_id": "event",
            "cache": "fresh",
        }
        self.clip = {"video": "001", "sha256": "abc", "file": "unused.mp4"}
        hasher = patch.object(batch, "sha", return_value="abc")
        hasher.start()
        self.addCleanup(hasher.stop)
        batch.STOP.clear()

    def request(self, base, token, path, output, **kwargs):
        batch.save(output, {"id": TICKET, "valuation": {"est_fill_pct": 50}})
        batch.save(output.with_suffix(".http.json"), {"status": "201", "seconds": 1})
        return "201"

    def test_completed_clip_is_never_resubmitted(self):
        with (
            patch.object(batch, "api", side_effect=self.request) as post,
            patch.object(batch, "get"),
        ):
            batch.process_clip(self.folder, self.manifest, self.clip, "secret")
            batch.process_clip(self.folder, self.manifest, self.clip, "secret")
        self.assertEqual(post.call_count, 1)
        self.assertIn("bypass_cache=true", post.call_args.args[2])

    def test_unknown_request_is_held_without_retry(self):
        batch.save(self.folder / "001/state.json", {"status": "submitting"})
        with patch.object(batch, "api") as post:
            batch.process_clip(self.folder, self.manifest, self.clip, "secret")
        post.assert_not_called()

    def test_recover_saved_201_without_ingest(self):
        batch.save(self.folder / "001/state.json", {"status": "submitting"})
        self.request(None, None, None, self.folder / "001/ingest.json")
        with patch.object(batch, "api") as post, patch.object(batch, "get"):
            batch.process_clip(self.folder, self.manifest, self.clip, "secret")
        post.assert_not_called()
        self.assertEqual(
            batch.read(self.folder / "001/state.json")["status"], "complete"
        )

    def test_detail_failure_resume_only_fetches_details(self):
        with patch.object(batch, "api", side_effect=self.request) as post:
            with (
                patch.object(
                    batch, "get", side_effect=ValueError("temporary read error")
                ),
                self.assertRaises(ValueError),
            ):
                batch.process_clip(self.folder, self.manifest, self.clip, "secret")
            with patch.object(batch, "get"):
                batch.process_clip(self.folder, self.manifest, self.clip, "secret")
        self.assertEqual(post.call_count, 1)

    def test_cache_reuse_does_not_force_fresh_analysis(self):
        self.manifest["cache"] = "reuse"
        with (
            patch.object(batch, "api", side_effect=self.request) as post,
            patch.object(batch, "get"),
        ):
            batch.process_clip(self.folder, self.manifest, self.clip, "secret")
        self.assertIn("bypass_cache=false", post.call_args.args[2])

    def test_remote_backend_refused_before_docker_or_network(self):
        with patch.object(batch, "command") as cmd, self.assertRaises(ValueError):
            batch.runtime("https://example.com")
        cmd.assert_not_called()

    def test_changed_source_never_submits(self):
        with (
            patch.object(batch, "sha", return_value="changed"),
            patch.object(batch, "api") as post,
            self.assertRaisesRegex(ValueError, "Source bytes changed"),
        ):
            batch.process_clip(self.folder, self.manifest, self.clip, "secret")
        post.assert_not_called()

    def test_sync_requires_exact_approved_bundle(self):
        batch.save(self.folder / "promotion.json", {"reviewed": True})
        args = SimpleNamespace(command="sync", target_file="unused", approve="wrong")
        with (
            patch.object(batch, "container") as container,
            self.assertRaisesRegex(ValueError, "explicit user approval"),
        ):
            batch.promotion(args, self.folder)
        container.assert_not_called()


class BundleGuards(unittest.TestCase):
    def bundle(self):
        tenant = "11111111-1111-1111-1111-111111111111"
        event = "22222222-2222-2222-2222-222222222222"

        def row(id, **kwargs):
            return {"id": id, "tenant_id": tenant, **kwargs}

        return {
            "version": 1,
            "tenant_id": tenant,
            "event_id": event,
            "tables": {
                "events": [row(event)],
                "tickets": [row(TICKET, event_id=event, clip_id=None)],
                "pipeline_stages": [row("stage", ticket_id=TICKET)],
                "anomalies": [],
                "ticket_evidence": [
                    row("evidence", ticket_id=TICKET, media_storage="b2")
                ],
            },
        }

    def test_valid_bundle(self):
        db.validate(self.bundle())

    def test_cross_tenant_refused(self):
        bundle = self.bundle()
        bundle["tables"]["tickets"][0]["tenant_id"] = "another-tenant"
        with self.assertRaisesRegex(ValueError, "Cross-tenant"):
            db.validate(bundle)

    def test_missing_persistent_evidence_refused(self):
        bundle = self.bundle()
        bundle["tables"]["ticket_evidence"][0]["media_storage"] = "memory"
        with self.assertRaisesRegex(ValueError, "persistent B2 evidence"):
            db.validate(bundle)


class PromotionTransactions(unittest.IsolatedAsyncioTestCase):
    async def exercise(self, action, conflict=False):
        from contextlib import asynccontextmanager
        from unittest.mock import AsyncMock

        from sqlalchemy.sql.dml import Insert
        from sqlalchemy.sql.selectable import Select

        bundle = BundleGuards().bundle()
        bundle["evidence_bucket"] = "benchmark-bucket"
        for model in db.MODELS:
            for row in bundle["tables"][model.__tablename__]:
                for col in model.__table__.columns:
                    row.setdefault(col.name, None)
        bundle["tables"]["pipeline_stages"][0]["id"] = (
            "44444444-4444-4444-4444-444444444444"
        )
        bundle["tables"]["ticket_evidence"][0]["id"] = (
            "55555555-5555-5555-5555-555555555555"
        )
        executed = []
        outcome = []

        async def execute(stmt, *args):
            executed.append(stmt)
            rows = []
            if (
                isinstance(stmt, Select)
                and conflict
                and stmt.get_final_froms()[0].name == "events"
            ):
                rows = [
                    {**bundle["tables"]["events"][0], "name": "different existing name"}
                ]
            return SimpleNamespace(
                scalar=lambda: None,
                first=lambda: ("existing tenant",),
                mappings=lambda: rows,
            )

        @asynccontextmanager
        async def begin():
            try:
                yield SimpleNamespace(execute=execute)
            except ValueError:
                outcome.append("rollback")
                raise
            else:
                outcome.append("commit")

        engine = SimpleNamespace(begin=begin, dispose=AsyncMock())
        data = {
            "action": action,
            "bundle": bundle,
            "target": "postgresql://user:password@project.supabase.co/postgres",
            "target_bucket": "benchmark-bucket",
        }
        with patch.object(db, "create_async_engine", return_value=engine):
            if conflict:
                with self.assertRaisesRegex(ValueError, "Conflicting"):
                    await db.promote(data)
            else:
                await db.promote(data)
        return [s for s in executed if isinstance(s, Insert)], outcome

    async def test_sync_plan_never_inserts(self):
        inserts, _ = await self.exercise("sync-plan")
        self.assertEqual(inserts, [])

    async def test_approved_sync_inserts_selected_rows(self):
        inserts, outcome = await self.exercise("sync")
        self.assertEqual(len(inserts), 4)
        self.assertEqual(outcome, ["commit"])

    async def test_conflict_aborts_before_any_insert(self):
        inserts, outcome = await self.exercise("sync", conflict=True)
        self.assertEqual(inserts, [])
        self.assertEqual(outcome, ["rollback"])


if __name__ == "__main__":
    unittest.main()
