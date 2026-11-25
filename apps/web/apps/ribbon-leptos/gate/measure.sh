#!/usr/bin/env bash
# Gate: build, measure and verify the Leptos ribbon against ONLYOFFICE layout.
# Usage: bash apps/web/apps/ribbon-leptos/gate/measure.sh
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
CRATE="$ROOT/apps/web/apps/ribbon-leptos"
cd "$CRATE"

# --- Build (trunk build --release) ---
echo "=== TRUNK BUILD ==="
LOG="$(mktemp)"
BUILD_START=$(date +%s)
if ! trunk build --release >"$LOG" 2>&1; then
    grep -E "^error|ERROR|error\[:digit:\]" -A6 "$LOG" | head -60
    echo "gate: BUILD FAILED"
    exit 1
fi
BUILD_END=$(date +%s)
BUILD_S=$((BUILD_END - BUILD_START))
grep -E "wasm-bindgen version|success" "$LOG" | tail -2 || true

# --- Capture file sizes ---
WASM=$(ls dist/*_bg.wasm | head -1)
JS=$(ls dist/*.js | head -1)
WASM_RAW=$(stat -c%s "$WASM")
WASM_GZ=$(gzip -9c "$WASM" | wc -c | xargs)
JS_RAW=$(stat -c%s "$JS")
JS_GZ=$(gzip -9c "$JS" | wc -c | xargs)

# --- Serve dist/ ---
PORT="$(shuf -i 8700-8799 -n 1)"
/usr/bin/python3 -m http.server "$PORT" --bind 127.0.0.1 --directory dist >/dev/null 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT
sleep 0.7

echo "=== RUN CENSUS ==="
# Run census-react-deep.cjs against the local server
E2E_NM="${WO_E2E_NODE_MODULES:-/home/weiss/git/World-Office/server/tests/node_modules}"
OUT="$(mktemp -d)"
CENSUS_SCRIPT="/home/weiss/git/World-Office/wo-test-harness/census/census-react-deep.cjs"
CENSUS_OO="/home/weiss/git/World-Office/wo-test-harness/census/census/census-oo-deep.json"
CENSUS_WO="$OUT/census-react-deep.json"

export CENSUS_REACT_URL="http://127.0.0.1:$PORT/"
export CENSUS_OUT="$OUT"
NODE_PATH="$E2E_NM" node "$CENSUS_SCRIPT"

echo "=== LAYOUT DIFF ==="
# Run layout-diff.py
LAYOUT_DIFF="/home/weiss/git/World-Office/wo-test-harness/census/layout-diff.py"
# Use a subshell with error handling to capture output even on failure
LAYOUT_OUTPUT=$( /usr/bin/python3 "$LAYOUT_DIFF" --tab Home --oo "$CENSUS_OO" --wo "$CENSUS_WO" 2>&1 || true )
echo "$LAYOUT_OUTPUT"

# Parse layout-diff output to get the numbers using python for reliability
# Use json output mode for easier parsing
JSON_OUTPUT=$(/usr/bin/python3 "$LAYOUT_DIFF" --tab Home --oo "$CENSUS_OO" --wo "$CENSUS_WO" --json 2>&1 || true)
OO_ROWS=$(echo "$JSON_OUTPUT" | /usr/bin/python3 -c "import json, sys; d=json.load(sys.stdin); print(d.get('oo', {}).get('rows', 'N/A'))")
OO_GROUPS=$(echo "$JSON_OUTPUT" | /usr/bin/python3 -c "import json, sys; d=json.load(sys.stdin); print(d.get('oo', {}).get('groups', 'N/A'))")
WO_ROWS=$(echo "$JSON_OUTPUT" | /usr/bin/python3 -c "import json, sys; d=json.load(sys.stdin); print(d.get('wo', {}).get('rows', 'N/A'))")
WO_GROUPS=$(echo "$JSON_OUTPUT" | /usr/bin/python3 -c "import json, sys; d=json.load(sys.stdin); print(d.get('wo', {}).get('groups', 'N/A'))")
LAYOUT_OK=$(echo "$JSON_OUTPUT" | /usr/bin/python3 -c "import json, sys; d=json.load(sys.stdin); print(int(d.get('ok', False)))")

# Get commit hash
WO_COMMIT=$(git rev-parse --short HEAD)

# --- WRITE MEASUREMENTS.md ---
cat > "$CRATE/MEASUREMENTS.md" <<EOF
# MEASUREMENTS.md — ADR-F1 ribbon census

## Machine-readable summary

WO_COMMIT=$WO_COMMIT
WASM_RAW=$WASM_RAW
WASM_GZ=$WASM_GZ
JS_RAW=$JS_RAW
JS_GZ=$JS_GZ
BUILD_S=$BUILD_S
OO_ROWS=$OO_ROWS
WO_ROWS=$WO_ROWS
OO_GROUPS=$OO_GROUPS
WO_GROUPS=$WO_GROUPS
LAYOUT_OK=$LAYOUT_OK

## Human table

| Metric | ONLYOFFICE | World-Office (Leptos) |
|--------|-------------|-------------------------|
| Rows (Home ribbon) | $OO_ROWS | $WO_ROWS |
| Groups (Home ribbon) | $OO_GROUPS | $WO_GROUPS |
| WASM raw size | N/A | $WASM_RAW B |
| WASM gzipped | N/A | $WASM_GZ B |
| JS raw size | N/A | $JS_RAW B |
| JS gzipped | N/A | $JS_GZ B |
| Build time | N/A | ${BUILD_S}s |
| Layout parity | N/A | $(if [ $LAYOUT_OK -eq 1 ]; then echo "PASS"; else echo "FAIL"; fi) |

## Verbatim layout-diff output

\`\`\`
$LAYOUT_OUTPUT
\`\`\`

## Method

- Toolchain: trunk $(trunk --version 2>/dev/null || echo 'unknown') + $(grep -A1 'name = "leptos"' Cargo.lock | tail -1 | tr -s ' ' | cut -d' ' -f2- | tr -d '\"' || echo 'unknown')
- Census: census-react-deep.cjs from /home/weiss/git/World-Office/wo-test-harness/census/ running against local build served at http://127.0.0.1:$PORT/
- Layout diff: layout-diff.py from /home/weiss/git/World-Office/wo-test-harness/census/ comparing against golden census-oo-deep.json
- Viewport: 1600x1000
- Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF

# --- Exit gate ---
if [ $LAYOUT_OK -eq 1 ]; then
    echo "MEASURE OK"
    exit 0
else
    echo "MEASURE FAIL (LAYOUT REGRESSION)"
    exit 1
fi
