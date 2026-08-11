# wo-orchestrator

A standalone agent loop that executes the **Engine Rebuild Master Plan** — 69
tasks across 11 engines (foundation + DM/TL/FL/SS/SL/CH/RT/PDF/CO/SP) — by
dispatching each task to an isolated git worktree and driving `pi` headless
against one of four configured LLM providers, then verifying the result against
an exact acceptance gate before merging.

```
 tasks.json (69 tasks, declarative)   ─┐
 workers.json (4 providers)            ├──► orchestrator.sh ──► per-task:
 plan/*.md (contract source)           ─┘      worktree → pi --provider X --model Y -p
                                              → acceptance gate → merge → status
```

## Quick start

```sh
cd server/scripts/wo-orchestrator

# 0. self-test (29 tests, ~15s)
bash tests/run-all-tests.sh

# 1. regenerate the task manifest from the plan (after editing the plan)
python3 scripts/generate-tasks.py            # writes config/tasks.json

# 2. see the board
./orchestrator.sh --status

# 3. preview one dispatch round (no pi, no worktree)
./orchestrator.sh --dry-run

# 4. run for real (until all tasks done, polling every 15s)
./orchestrator.sh
```

## Workers

Configured in `config/workers.json`, verified against `~/.pi/agent/models.json`:

| worker       | provider      | model                        | endpoint                          |
|--------------|---------------|------------------------------|-----------------------------------|
| `zai`        | zai           | glm-5-turbo                  | api.z.ai                          |
| `tud`        | tud           | Mistral-Medium-3.5-128B      | llm-service.ai.tu-darmstadt.de    |
| `opencode`   | opencode-free | deepseek-v4-flash            | opencode.ai/zen (free)            |
| `local-flash`| litellm       | deepseek-v4-flash/local      | 127.0.0.1:4000 (local AI cluster) |

Each worker runs at most one task at a time (`max_concurrent: 1`). The
orchestrator dispatches up to `WO_MAX_PARALLEL` tasks concurrently (default =
number of enabled workers). To add/remove workers, edit `workers.json` and
re-run `tests/test-manifest.sh`.

## How a task runs

1. **Ready check** — a task is *ready* iff `status == ready` **and** every
   dependency is `done`. Failed tasks re-become ready after a cooldown, up to
   `max_attempts`.
2. **Isolation** — `git worktree add .wo-worktrees/<id> -b agent/<id> main` so
   concurrent workers never touch each other's files.
3. **Dispatch** — the worker prompt (`prompts/worker.md`, filled with the
   task's scope/contract/accept-gate) is sent to `pi --provider … --model … -p`.
4. **Verify** — the task's `accept` shell command runs in the worktree
   (`cargo test -p …`, `pnpm … lint typecheck test`, `wasm-pack build`, …).
   Pass → merge; fail → record error, retry or fail permanently.
5. **Merge** — `git merge --ff-only agent/<id>` into `main` under a lock; then
   the worktree + branch are cleaned up.
6. **Status** — written to `state/task-status.json` under a status lock.

All shared-state writes (status JSON, `main` checkout) are serialised with
`flock`; the long `pi` run is fully parallel across worktrees.

## CLI reference

```
orchestrator.sh                 run until all tasks done (or deadlock)
orchestrator.sh --once          dispatch one round, then exit
orchestrator.sh --dry-run       show the dispatch plan, change nothing
orchestrator.sh --status        print the status board, exit
orchestrator.sh --task FC-1     dispatch exactly one task (ignore deps of others)
orchestrator.sh --worker zai    restrict to a single worker
orchestrator.sh --poll 30       sleep between rounds (default 15)
orchestrator.sh --max-rounds 5  stop after N rounds
orchestrator.sh --max-parallel 2
```

Environment overrides: `WO_REPO_DIR`, `WO_WORKTREE_ROOT`, `WO_STATE_DIR`,
`WO_CONFIG_DIR`, `WO_BRANCH_PREFIX`, `WO_MAX_PARALLEL`, `WO_MERGE_LOCK`.

## Files

```
config/tasks.json     69 tasks (regenerated from the plan — do not hand-edit)
config/workers.json   4 LLM workers
scripts/generate-tasks.py   plan/*.md → config/tasks.json (re-run after plan edits)
prompts/worker.md     reusable worker prompt ({{placeholders}} filled at dispatch)
lib/common.sh         paths, logging, jq helpers
lib/status.sh         task status machine (ready/running/verifying/done/failed)
lib/worktree.sh       git worktree create/merge/remove, gitignore handling
lib/dispatch.sh       prompt render + pi invocation + lifecycle
lib/verify.sh         acceptance gate (pass/fail/timeout) + scope-drift check
orchestrator.sh       main loop
tests/                29 self-tests (manifest, status, worktree, verify, dispatch, integration)
```

## Regenerating the manifest

`tasks.json` is **generated**, not hand-maintained. After editing
`plan/2026-07-25-engine-rebuild-execution-plan.md`:

```sh
python3 scripts/generate-tasks.py --check    # validate (exit 1 if scopes missing)
python3 scripts/generate-tasks.py            # regenerate
```

Per-task file scopes live in `SCOPES` inside `generate-tasks.py` (the plan's
tables carry deps + acceptance prose; scopes are derived from the contract
sections). The 4 foundation tasks (`FC-1..4`) are injected explicitly because
they're defined in §2 prose, not in pipe tables.

## Safety

- Worktrees live in `.wo-worktrees/` (gitignored automatically if inside repo).
- `wo_locked_mv` refuses to overwrite state with invalid JSON (prevents a
  failed `jq` write from corrupting the status file).
- A worker that edits out-of-scope files is *warned* (advisory) but not blocked
  — the acceptance gate is authoritative.
- Each task's prompt forbids editing outside its `scope` and requires the worker
  to run the acceptance gate before committing.

## Notes

- Requires: `pi` (headless), `jq`, `flock` (util-linux), `git`, `cargo`, `pnpm`,
  `wasm-pack` (all on PATH from the repo's normal dev environment).
- The orchestrator never pushes — it merges to local `main`. Push separately
  (`git push`) or wire it into your existing `wo-agent-dev-loop.sh` push step.
- The local-flash worker routes through the LiteLLM gateway at `127.0.0.1:4000`;
  ensure it's up (`curl http://127.0.0.1:4000/health/liveliness` → 200).
