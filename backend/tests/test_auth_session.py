"""Login/logout/me endpoint tests for the app's own session auth."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.deps import current_member
from app.main import app


def _no_default_auth():
    """Context-free helper: drop the conftest super_admin override."""
    return app.dependency_overrides.pop(current_member, None)


def test_directory_lists_active_members(client: TestClient) -> None:
    members = client.get("/auth/directory").json()
    emails = {m["email"] for m in members}
    assert "root@loadtruth.io" in emails
    assert all(m["role"] for m in members)


def test_login_returns_token_and_capabilities(client: TestClient) -> None:
    saved = _no_default_auth()
    try:
        resp = client.post("/auth/login", json={"email": "root@loadtruth.io"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["token"]
        assert body["member"]["role"] == "super_admin"
        caps = body["member"]["capabilities"]
        assert caps["manage_users"] is True
        assert caps["review_tickets"] is True
    finally:
        if saved is not None:
            app.dependency_overrides[current_member] = saved


def test_login_rejects_unknown_email(client: TestClient) -> None:
    saved = _no_default_auth()
    try:
        resp = client.post("/auth/login", json={"email": "nobody@nowhere.io"})
        assert resp.status_code == 401
    finally:
        if saved is not None:
            app.dependency_overrides[current_member] = saved


def test_token_authenticates_a_request(client: TestClient) -> None:
    saved = _no_default_auth()
    try:
        token = client.post("/auth/login", json={"email": "monitor1@gulfresponse.org"}).json()[
            "token"
        ]
        # A real request with the bearer token resolves the member and its role.
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me["role"] == "monitor"
        assert me["capabilities"]["manage_users"] is False
        # And the role is enforced: a monitor cannot create an event.
        denied = client.post(
            "/events", json={"name": "X"}, headers={"Authorization": f"Bearer {token}"}
        )
        assert denied.status_code == 403
    finally:
        if saved is not None:
            app.dependency_overrides[current_member] = saved


def test_logout_requires_auth_and_succeeds(client: TestClient) -> None:
    saved = _no_default_auth()
    try:
        token = client.post("/auth/login", json={"email": "root@loadtruth.io"}).json()["token"]
        assert client.post("/auth/logout").status_code == 401
        ok = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert ok.status_code == 204
    finally:
        if saved is not None:
            app.dependency_overrides[current_member] = saved


def test_superadmin_login_success(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import hashlib
    from app.config import get_settings
    monkeypatch.setenv("SUPERADMIN_USERNAME_HASH", hashlib.sha256(b"testdev").hexdigest())
    monkeypatch.setenv("SUPERADMIN_PASSWORD_HASH", hashlib.sha256(b"TestDevPassword123!").hexdigest())
    get_settings.cache_clear()
    saved = _no_default_auth()
    try:
        resp = client.post(
            "/auth/superadmin/login",
            json={"username": "testdev", "password": "TestDevPassword123!"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token"]
        assert body["member"]["role"] == "super_admin"
        assert body["member"]["capabilities"]["manage_settings"] is True
        assert body["member"]["capabilities"]["manage_demo_videos"] is True
    finally:
        get_settings.cache_clear()
        if saved is not None:
            app.dependency_overrides[current_member] = saved


def test_superadmin_login_invalid_credentials_rejected(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import hashlib
    from app.config import get_settings
    monkeypatch.setenv("SUPERADMIN_USERNAME_HASH", hashlib.sha256(b"testdev").hexdigest())
    monkeypatch.setenv("SUPERADMIN_PASSWORD_HASH", hashlib.sha256(b"TestDevPassword123!").hexdigest())
    get_settings.cache_clear()
    saved = _no_default_auth()
    try:
        resp = client.post(
            "/auth/superadmin/login",
            json={"username": "testdev", "password": "WrongPassword!"},
        )
        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]
    finally:
        get_settings.cache_clear()
        if saved is not None:
            app.dependency_overrides[current_member] = saved
