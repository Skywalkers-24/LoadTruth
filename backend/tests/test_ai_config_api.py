"""API tests for the admin AI model/effort configuration endpoints.

Exercises GET /system/ai-config (catalog + current selections), the PATCH that
sets a task's model/effort/cost mode, validation of ineligible picks, the RBAC
guard, and the reset-to-default action.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.ai.config_store import get_ai_config_store


def _reset_store() -> None:
    """Drop any overrides left by a prior test (store is a process singleton)."""
    get_ai_config_store()._overrides.clear()  # noqa: SLF001 — test-only reset


def test_get_ai_config_returns_catalog_and_defaults(client: TestClient) -> None:
    _reset_store()
    body = client.get("/system/ai-config").json()
    assert {"catalog", "config"} <= body.keys()
    assert body["catalog"]["efforts"] == ["minimal", "low", "balanced", "high", "max"]
    assert body["catalog"]["cost_modes"] == ["standard", "contributor"]
    task_ids = {t["id"] for t in body["catalog"]["tasks"]}
    expected = {
        "sam_track",
        "spark_ocr",
        "spark_classify",
        "name_load",
        "narrate_anomaly",
        "explain_pipeline",
        "analyst_chat",
    }
    assert task_ids == expected
    ocr = next(c for c in body["config"] if c["task_id"] == "spark_ocr")
    assert ocr["model"] == "muse-spark-1.3"
    assert ocr["effort"] == "low"


def test_patch_updates_task_model_and_effort(client: TestClient) -> None:
    _reset_store()
    resp = client.patch(
        "/system/ai-config/spark_classify",
        json={"model": "muse-wonder-1.0", "effort": "high"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["model"] == "muse-wonder-1.0"
    assert body["effort"] == "high"
    # Change persists on the next GET.
    cfg = client.get("/system/ai-config").json()["config"]
    row = next(c for c in cfg if c["task_id"] == "spark_classify")
    assert row["model"] == "muse-wonder-1.0"


def test_patch_rejects_ineligible_model(client: TestClient) -> None:
    _reset_store()
    # SAM is the only model eligible for the vision task.
    resp = client.patch("/system/ai-config/sam_track", json={"model": "muse-wonder-1.0"})
    assert resp.status_code == 400
    assert "not eligible" in resp.json()["detail"]


def test_patch_rejects_unsupported_effort(client: TestClient) -> None:
    _reset_store()
    # Contributor variant does not support the 'max' effort level.
    resp = client.patch(
        "/system/ai-config/spark_ocr",
        json={"model": "muse-spark-1.3-contributor", "effort": "max", "cost_mode": "contributor"},
    )
    assert resp.status_code == 400
    assert "effort" in resp.json()["detail"]


def test_patch_requires_admin_role(client: TestClient, as_role) -> None:
    _reset_store()
    as_role("monitor")
    resp = client.patch("/system/ai-config/spark_ocr", json={"effort": "minimal"})
    assert resp.status_code == 403


def test_reset_reverts_to_default(client: TestClient) -> None:
    _reset_store()
    client.patch("/system/ai-config/narrate_anomaly", json={"model": "muse-spark-1.2"})
    resp = client.post("/system/ai-config/narrate_anomaly/reset")
    assert resp.status_code == 200
    assert resp.json()["model"] == "muse-spark-1.3"
