#!/usr/bin/env bash
# wo-port-loop.sh — campaign supervisor: iterate until MASTER GATE green.
#   wave: af run (fleet, tasks hot-reloadable) → build HEAD (wasm+dist) →
#         rig + capture → master gate → derive gaps → inject tasks → repeat
# Stop conditions: master gate PASS | touch .stop | MAX_ITERS
set -u
SERVER=/home/weiss/git/World-Office/server
HARNESS=/home/weiss/git/World-Office/wo-test-harness
CAMP="$SERVER/config/port-finish"
AF=/home/weiss/git/agentflow/target/release/af
PORT=8932
MAX_ITERS="${MAX_ITERS:-12}"
mkdir -p "$SERVER/.af-state/port-finish"
export AF_STATE_DIR="$SERVER/.af-state/port-finish"
export AF_WORKTREE_ROOT="$SERVER/state/worktrees"
export LITELLM_API_KEY="${LITELLM_API_KEY:-$(grep -rhoP 'LITELLM_API_KEY=\K.*' ~/.bashrc ~/.profile 2>/dev/null | head -1)}"

iter=0
while [ "$iter" -lt "$MAX_ITERS" ]; do
  [ -f "$CAMP/.stop" ] && { echo "[loop] .stop found — exiting"; exit 0; }
  iter=$((iter+1)); echo "[loop] === iteration $iter ($(date -u +%FT%TZ)) ==="

  # 1) fleet wave (af runs until DAG done; hot-reloads tasks.json)
  echo "[loop] af wave starting"
  ( cd "$SERVER" && mkdir -p "$AF_WORKTREE_ROOT" && "$AF" run \
      --tasks config/port-finish/tasks.json \
      --workers config/port-finish/workers.json \
      --repos config/port-finish/repos.json ) >> "$SERVER/.af-state/port-finish.log" 2>&1
  echo "[loop] af wave exited rc=$?"

  # 2) build server HEAD into the rig (wasm-pack BEFORE vite build — else stale engine)
  echo "[loop] rebuilding engine + dist"
  ( cd "$SERVER" && wasm-pack build core/crates/wo-renderer-wasm --target web >/dev/null 2>&1 \
      && ( cd apps/web/apps/documenteditor-react && pnpm build >/dev/null 2>&1 ) ) \
    || { echo "[loop] BUILD FAILED — see above"; sleep 30; continue; }
  for pid in $(pgrep -f wo-docserver); do
    tr '\0' ' ' < "/proc/$pid/environ" 2>/dev/null | grep -q "DOCSERVER_PORT=$PORT" && kill "$pid"
  done
  ( cd "$HARNESS/census" && setsid nohup bash run-react-rig.sh "$PORT" > /tmp/react-rig.log 2>&1 < /dev/null & )
  for i in $(seq 1 30); do sleep 2; curl -s -o /dev/null "http://127.0.0.1:$PORT/word/" && break; done
  sleep 5

  # 3) re-capture the deep census against the FRESH build (else coverage reads stale data)
  echo "[loop] capturing fresh census"
  ( cd "$HARNESS/census" && CENSUS_REACT_URL="http://127.0.0.1:$PORT/word/" /usr/bin/node census-react-deep.cjs ) \
    || echo "[loop] census capture FAILED — coverage will use the previous snapshot"

  # 4) master gate
  if bash "$HARNESS/census/react-e2e/master-gate.sh"; then
    echo "[loop] MASTER GATE PASS — port 100% verified E2E (iteration $iter)"
    touch "$CAMP/.done"
    exit 0
  fi

  # 5) derive gaps → inject follow-up tasks (af hot-reload picks them up next wave)
  echo "[loop] deriving gaps"
  /usr/bin/python3 "$CAMP/derive-gaps.py" || true
done
echo "[loop] MAX_ITERS reached — master gate still red; inspect manually"
exit 1
