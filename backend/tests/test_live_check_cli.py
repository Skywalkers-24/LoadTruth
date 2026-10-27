"""The `python -m app.ai.live_check` command (no network)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from app.ai import live_check
from app.config import get_settings


@pytest.fixture
def no_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("MODEL_API_KEY", "TO_BE_UPDATED_LATER")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_missing_key_exits_2_without_calling_meta(
    no_key: None, capsys: pytest.CaptureFixture[str]
) -> None:
    assert live_check.main([]) == 2
    out = capsys.readouterr().out
    assert "NOT SET" in out
    assert "TO_BE_UPDATED_LATER" not in out  # the key value is never printed


def test_missing_clip_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert live_check.main([str(tmp_path / "nope.mp4")]) == 2
    assert "Clip not found" in capsys.readouterr().out
