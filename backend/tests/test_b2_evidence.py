"""Cloud evidence is authoritative; no filesystem cache or fallback exists."""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.pipeline import b2_store, evidence_store


@pytest.mark.asyncio
async def test_evidence_metadata_and_signed_playback_use_bucket_only(b2_objects) -> None:  # type: ignore[no-untyped-def]
    key = "a" * 64
    await evidence_store.save(key, b"processed", mime="video/mp4", fps=6)
    stored = await evidence_store.load(key)
    assert stored is not None and stored.mime == "video/mp4" and stored.fps == 6
    assert b2_objects[stored.object_key][0] == b"processed"
    assert not hasattr(stored, "path")
    assert (await evidence_store.media_url(key)).startswith("https://private-b2.test/")


@pytest.mark.asyncio
async def test_bucket_outage_fails_instead_of_accepting_local_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(*args: object) -> None:
        raise OSError("simulated cloud outage")

    monkeypatch.setattr(b2_store, "put", unavailable)
    with pytest.raises(b2_store.StorageUnavailableError):
        await evidence_store.save("b" * 64, b"not-saved", mime="image/png")
    assert await evidence_store.load("b" * 64) is None


@pytest.mark.asyncio
async def test_no_credentials_cannot_fall_back_to_disk(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("B2_APPLICATION_KEY", "")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError):
        await evidence_store.save("c" * 64, b"not-saved", mime="image/png")


@pytest.mark.asyncio
async def test_unsafe_key_never_reaches_bucket(b2_objects) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError):
        await evidence_store.save("../outside", b"not-saved", mime="image/png")
    assert not b2_objects
