"""Root cross-module test discovery and environment contract checks."""

from __future__ import annotations

from pathlib import Path


def test_repository_structure_integrity() -> None:
    """Ensure core submodules exist and maintain structural modularity."""
    root = Path(__file__).resolve().parent.parent
    assert (root / "backend").is_dir(), "backend directory must exist"
    assert (root / "frontend").is_dir(), "frontend directory must exist"
    assert (root / "backend" / "tests").is_dir(), "backend/tests directory must exist"
    assert (root / "frontend" / "package.json").is_file(), "frontend package.json must exist"


def test_backend_test_suite_referenced() -> None:
    """Verify backend contains active automated test suite files."""
    root = Path(__file__).resolve().parent.parent
    backend_tests = list((root / "backend" / "tests").glob("test_*.py"))
    assert len(backend_tests) >= 30, f"Expected 30+ backend test modules, found {len(backend_tests)}"
