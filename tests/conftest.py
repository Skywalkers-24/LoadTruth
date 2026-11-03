"""Root conftest: sets up path discovery for backend and shared evaluation fixtures."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure required environment defaults are present for headless test runs
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("MODEL_API_KEY", "test-key-mock")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-root-harness-running-32b")
