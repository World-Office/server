#!/usr/bin/env bash
# Gate helper: build the PoC with trunk, serve dist/ on a random local port, run a Playwright probe.
#   usage:  bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/<probe>.cjs
# The probe receives the base URL as argv[1]; its exit code is the gate result.
# Playwright comes from the MAIN checkout's server/tests/node_modules (pnpm; worktrees have no node_modules).
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
CRATE="$ROOT/apps/web/apps/ribbon-leptos"
PROBE="$ROOT/$1"
[ -f "$PROBE" ] || { echo "gate: probe not found: $1"; exit 2; }
E2E_NM="${WO_E2E_NODE_MODULES:-/home/weiss/git/World-Office/server/tests/node_modules}"
[ -d "$E2E_NM/@playwright/test" ] || { echo "gate: playwright not found at $E2E_NM (set WO_E2E_NODE_MODULES)"; exit 2; }

cd "$CRATE"
LOG="$(mktemp)"
if ! trunk build --release >"$LOG" 2>&1; then grep -E "^error|ERROR|error\[" -A6 "$LOG" | head -60; echo "gate: BUILD FAILED"; exit 1; fi
grep -E "wasm-bindgen version|success" "$LOG" | tail -2 || true
WASM=$(ls dist/*_bg.wasm | head -1); JS=$(ls dist/*.js | head -1)
printf 'gate: wasm %s B (%s B gzip)  js %s B (%s B gzip)\n' \
  "$(stat -c%s "$WASM")" "$(gzip -9c "$WASM" | wc -c)" "$(stat -c%s "$JS")" "$(gzip -9c "$JS" | wc -c)"

PORT="$(shuf -i 8700-8799 -n 1)"
/usr/bin/python3 -m http.server "$PORT" --bind 127.0.0.1 --directory dist >/dev/null 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT
sleep 0.7
NODE_PATH="$E2E_NM" node "$PROBE" "http://127.0.0.1:$PORT/"
