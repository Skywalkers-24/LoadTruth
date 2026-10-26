"""Tests for Supabase JWT verification and the bearer-token API guard.

These cover the token layer without a database: valid/expired/forged tokens and
the 401 paths on a protected route. RLS tenant-isolation tests (which need a live
Postgres with the rbac extension) are tracked separately in PROGRESS.md.
"""

from __future__ import annotations

import time
from collections.abc import Iterator

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import CurrentUser
from app.config import get_settings
from app.db.tenant import AuthError, verify_token

_SECRET = "test-jwt-secret-value"  # noqa: S105 (test-only signing secret, not a credential)


@pytest.fixture(autouse=True)
def _configure_secret(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point settings at a known JWT secret and clear the cached singleton."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", _SECRET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _make_token(**overrides: object) -> str:
    payload: dict[str, object] = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "email": "monitor@example.com",
        "role": "authenticated",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    payload.update(overrides)
    return jwt.encode(payload, _SECRET, algorithm="HS256")


def test_verify_valid_token() -> None:
    ctx = verify_token(_make_token())
    assert ctx.user_id == "11111111-1111-1111-1111-111111111111"
    assert ctx.email == "monitor@example.com"
    assert ctx.role == "authenticated"


def test_verify_expired_token_rejected() -> None:
    expired = _make_token(exp=int(time.time()) - 10)
    with pytest.raises(AuthError):
        verify_token(expired)


def test_verify_wrong_secret_rejected() -> None:
    forged = jwt.encode(
        {
            "sub": "x",
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        "attacker-secret",
        algorithm="HS256",
    )
    with pytest.raises(AuthError):
        verify_token(forged)


def test_verify_missing_sub_rejected() -> None:
    # 'sub' is required; a token without it must be rejected.
    token = jwt.encode(
        {"aud": "authenticated", "exp": int(time.time()) + 3600},
        _SECRET,
        algorithm="HS256",
    )
    with pytest.raises(AuthError):
        verify_token(token)


def test_verify_wrong_audience_rejected() -> None:
    token = _make_token(aud="some-other-service")
    with pytest.raises(AuthError):
        verify_token(token)


# --- API guard (does not touch the DB) ---------------------------------------

_guard_app = FastAPI()


@_guard_app.get("/whoami")
async def _whoami(user: CurrentUser) -> dict[str, str]:
    return {"user_id": user.user_id}


_guard_client = TestClient(_guard_app)


def test_protected_route_requires_bearer() -> None:
    assert _guard_client.get("/whoami").status_code == 401


def test_protected_route_rejects_malformed_header() -> None:
    resp = _guard_client.get("/whoami", headers={"Authorization": "Token abc"})
    assert resp.status_code == 401


def test_protected_route_accepts_valid_token() -> None:
    resp = _guard_client.get("/whoami", headers={"Authorization": f"Bearer {_make_token()}"})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == "11111111-1111-1111-1111-111111111111"
