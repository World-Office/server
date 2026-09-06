# World-Office Test Harness

Unified entry point over the **live** test stack (Python/FastAPI docserver).
Every command is a real gate that CI also runs — no stubs, no fiction.

## Quick Start

```bash
# validate the harness itself (CI runs this)
PYTHON=python3 bash scripts/tf-test-harness/test-harness.sh --self-test

# full unit suite (1,500+ pytest tests)
bash scripts/tf-test-harness/test-harness.sh unit

# quality gates: graph drift + register resolution
bash scripts/tf-test-harness/test-harness.sh gates

# everything CI checks, in one command
bash scripts/tf-test-harness/test-harness.sh all

# impact analysis: tests affected by the current diff (TH-006)
bash scripts/tf-test-harness/test-harness.sh select
bash scripts/tf-test-harness/test-harness.sh select --base origin/main --list

# tests covering one register feature (TH-012)
bash scripts/tf-test-harness/test-harness.sh feature F-003

# machine-readable run report (TH-011, lite)
bash scripts/tf-test-harness/test-harness.sh all --json state/results.json
```

On hosts where `python3` is shimmed (e.g. a TaskFleet venv wrapper), pin the
interpreter: `PYTHON=/usr/bin/python3`.

## Commands

| Command    | What it runs                                                     | Gate source            |
|------------|------------------------------------------------------------------|------------------------|
| `unit`     | `uv run --frozen pytest tests/ -q -n auto --dist loadgroup`      | CI job `unit`          |
| `gates`    | `seed.py --check` (drift) + `check-register.py` over all F-###   | CI job `register`      |
| `select`   | `harness-graph/select-tests.py` — diff → affected e2e tests      | TH-006                 |
| `affected` | e2e **and unit** tests affected by the diff (`--base R`)         | TH-006                 |
| `feature`  | graph.json `COVERS` edges for one feature                        | TH-012                 |
| `e2e`      | `opencloud-docserver/e2e` against `$E2E_BASE` (skipped if unset);  |
|            | `--only wopi\|gui` picks the protocol/browser half                |
| `coverage` | unit suite + `--cov=src`, gated at `fail_under` (85)             |
| `mutation` | `scripts/mutation-test.py` — surviving mutants fail the gate     |
| `all`      | unit + gates (+ e2e only when `E2E_BASE` is set)                 |
| `--self-test` | toolchain, graph freshness, collection, register, select, tooling | runs in CI |

`unit` runs in parallel (pytest-xdist). The 68 browser tests spin their own
uvicorn + Chromium + WOPI-httpd stack each, so the `tests/e2e/` conftest pins
them to one xdist lane (`--dist loadgroup`) and marks them `flaky(reruns=2)`:
under a saturated machine one slow fetch can leave a page un-rendered, and a
retry separates that from a real regression. Every retry is visible as a
RERUN in the report. Set `WO_UNIT_WORKERS=0` (or `--serial`) for the plain
sequential suite; `WO_BROWSER_LANE=0` disables the lane markers.

## Inventory (TH-002)

```bash
python3 scripts/tf-test-harness/scripts/generate-tests.py            # -> config/tasks.json
python3 scripts/tf-test-harness/scripts/generate-tests.py --check    # gate
python3 scripts/tf-test-harness/scripts/generate-tests.py --summary  # counts only
```

The inventory is generated from what exists: `pytest --collect-only` for unit
tests, `e2e/test_*.py` for browser tests, `features.yaml` for the register,
plus the two quality gates. Nothing is invented.

## Where things live

- `scripts/harness-graph/` — the register (features.yaml), graph seeder,
  drift gate, coverage gate, impact analysis. **This is the source of truth.**
- `opencloud-docserver/tests/` — the unit suite (pytest).
- `opencloud-docserver/e2e/` — Playwright browser tests (need a live stack).
- `.github/workflows/docserver.yml` — CI: unit + gates, on every PR/push.

## Relationship to the TH roadmap

The original TH-001..TH-014 roadmap targeted the deprecated Rust stack
(`.forgejo` workflows, cargo-llvm-cov, cargo-mutants, criterion). This
harness implements that roadmap's *intent* against the stack that actually
ships:

| TH item | Status here |
|---------|-------------|
| TH-001 unified orchestrator | this `test-harness.sh` |
| TH-002 task generation | `generate-tests.py` over the live suite (1,500+ real tasks) |
| TH-003 graph drift gate in CI | `.github/workflows/docserver.yml` `register` job |
| TH-004 test parallelization | xdist `-n auto --dist loadgroup` + browser lane (≈3× faster) |
| TH-005 coverage gate | `coverage` command + CI `--cov` at `fail_under = 85` |
| TH-007 mutation testing | `mutation [MODULE]` over `scripts/mutation-test.py` |
| TH-006 test impact analysis | `select` (graph-driven, e2e layer) |
| TH-011 reports | `--json` run reports + `tasks.json` inventory |
| TH-012 feature mapping | `feature F-xxx` via graph `COVERS` edges |
| TH-014 documentation | this README |

Rust-side items (TH-008/010) are **not implemented** — that stack
is deprecated reference, per `plan/RETHINK_WORLD_OFFICE.md`.

## License

AGPL-3.0-or-later. Part of World-Office.
