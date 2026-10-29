from __future__ import annotations

from pathlib import Path

import pytest

from app.config import get_settings
from app.pipeline import b2_store, evidence_store


@pytest.fixture
def cloud(monkeypatch: pytest.MonkeyPatch) -> dict[str, tuple[bytes, str, float | None]]:
    for name, value in {
        "EVIDENCE_STORAGE": "b2",
        "B2_KEY_ID": "test-id",
        "B2_APPLICATION_KEY": "test-secret",
        "B2_BUCKET_NAME": "test-bucket",
        "B2_S3_ENDPOINT": "https://s3.example.test",
        "B2_REGION": "test",
    }.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    objects: dict[str, tuple[bytes, str, float | None]] = {}
    monkeypatch.setattr(
        b2_store, "put", lambda key, data, mime, fps: objects.update({key: (data, mime, fps)})
    )
    monkeypatch.setattr(b2_store, "get", lambda key: objects.get(key))
    return objects


@pytest.mark.asyncio
async def test_cloud_restores_media_and_metadata_after_local_disk_is_replaced(
    cloud: dict[str, tuple[bytes, str, float | None]],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    key = "a" * 64
    await evidence_store.save(key, b"processed-video", mime="video/mp4", fps=6.0)
    assert cloud[key] == (b"processed-video", "video/mp4", 6.0)
    monkeypatch.setenv("EVIDENCE_DIR", str(tmp_path / "replacement-disk"))
    get_settings.cache_clear()
    restored = await evidence_store.load(key)
    assert restored is not None
    assert restored.path.read_bytes() == b"processed-video"
    assert restored.mime == "video/mp4" and restored.fps == 6.0


@pytest.mark.asyncio
async def test_original_upload_cannot_replace_processed_evidence(
    cloud: dict[str, tuple[bytes, str, float | None]],
) -> None:
    key = "b" * 64
    await evidence_store.save(key, b"processed", mime="video/mp4", fps=6)
    await evidence_store.save(key, b"original-upload", mime="video/quicktime")
    assert cloud[key] == (b"processed", "video/mp4", 6)


@pytest.mark.asyncio
async def test_bucket_outage_keeps_local_evidence_available(
    cloud: dict[str, tuple[bytes, str, float | None]], monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable(*args: object) -> None:
        raise OSError("simulated outage")

    monkeypatch.setattr(b2_store, "put", unavailable)
    await evidence_store.save("c" * 64, b"local-fallback", mime="image/png")
    stored = await evidence_store.load("c" * 64)
    assert stored is not None and stored.path.read_bytes() == b"local-fallback"
    monkeypatch.setenv("EVIDENCE_LOCAL_FALLBACK", "false")
    get_settings.cache_clear()
    with pytest.raises(OSError):
        await evidence_store.save("d" * 64, b"strict-mode", mime="image/png")


@pytest.mark.asyncio
async def test_invalid_evidence_key_never_reaches_bucket(
    cloud: dict[str, tuple[bytes, str, float | None]],
) -> None:
    await evidence_store.save("../outside", b"bad", mime="image/png")
    assert await evidence_store.load("../outside") is None
    assert not cloud


@pytest.mark.asyncio
async def test_cloud_repairs_corrupt_local_metadata(
    cloud: dict[str, tuple[bytes, str, float | None]],
) -> None:
    key = "e" * 64
    await evidence_store.save(key, b"cloud-copy", mime="image/png")
    root = Path(get_settings().evidence_dir)
    (root / f"{key}.json").write_text("broken metadata")
    restored = await evidence_store.load(key)
    assert restored is not None and restored.path.read_bytes() == b"cloud-copy"
