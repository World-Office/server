"""Browser-suite lane for parallel runs.

Every test here spins its own uvicorn server + Chromium + WOPI httpd.
Running a dozen of those concurrently starves the CPU and flakes waits,
so when the browser lane runs INSIDE the full suite, ``--dist loadgroup``
pins its files to a small set of workers via ``xdist_group`` buckets
(``WO_BROWSER_WORKERS``, default 2) while the pure unit tests spread
across the remaining cores. For a dedicated browser run, set
``WO_BROWSER_WORKERS=0`` to add NO grouping so the lane spreads freely
across all workers (fastest; ``flaky(reruns=2)`` absorbs transient render
waits).

Browser tests additionally carry ``flaky(reruns=2)``: under a saturated
machine a single slow fetch can leave the page permanently un-rendered,
and a retry distinguishes that from a real regression (which fails
twice). Every retry is visible in the report as a RERUN entry.

Set ``WO_BROWSER_LANE=0`` to drop the browser lane entirely.
No-op when xdist is not installed (plain serial runs).
"""

from __future__ import annotations

import hashlib
import os

import pytest


def pytest_collection_modifyitems(config, items) -> None:
    if os.environ.get("WO_BROWSER_LANE") == "0":
        return
    workers = int(os.environ.get("WO_BROWSER_WORKERS", "2"))
    for item in items:
        if "/e2e/" in str(item.fspath):
            item.add_marker(pytest.mark.flaky(reruns=2))
            try:
                import xdist  # noqa: F401
            except ImportError:
                continue
            if workers <= 0:
                continue  # free-for-all lane (dedicated browser run)
            digest = hashlib.md5(str(item.fspath).encode()).hexdigest()
            bucket = int(digest, 16) % workers
            item.add_marker(pytest.mark.xdist_group(f"browser-{bucket}"))
