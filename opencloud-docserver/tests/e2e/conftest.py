"""Browser-suite lane for parallel runs.

Every test here spins its own uvicorn server + Chromium + WOPI httpd.
Running a dozen of those concurrently starves the CPU and flakes waits,
so under pytest-xdist all browser tests are pinned to ONE worker
(``--dist loadgroup``) while the pure unit tests spread across cores.

Browser tests additionally carry ``flaky(reruns=2)``: under a saturated
machine a single slow fetch can leave the page permanently un-rendered,
and a retry distinguishes that from a real regression (which fails
twice). Every retry is visible in the report as a RERUN entry.

No-op when xdist is not installed (plain serial runs).
"""

from __future__ import annotations

import os

import pytest

def pytest_collection_modifyitems(config, items) -> None:
    if os.environ.get("WO_BROWSER_LANE") == "0":
        return
    for item in items:
        if "/e2e/" in str(item.fspath):
            item.add_marker(pytest.mark.flaky(reruns=2))
            try:
                import xdist  # noqa: F401
            except ImportError:
                continue
            item.add_marker(pytest.mark.xdist_group("browser"))
