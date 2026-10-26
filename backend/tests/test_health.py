"""Smoke tests for the health endpoint and settings wiring."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "model_api_configured" in body


def test_health_reports_model_api_flag_is_bool() -> None:
    body = client.get("/health").json()
    assert isinstance(body["model_api_configured"], bool)
