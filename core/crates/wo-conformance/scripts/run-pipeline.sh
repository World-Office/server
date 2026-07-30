#!/usr/bin/env bash
# Run the full conformance pipeline locally.
# Usage: ./scripts/run-pipeline.sh [--force]
#
# Steps:
#   1. Build wo-render-ir binary
#   2. Generate corpus .docx files (if --force or missing)
#   3. Capture truth from LibreOffice (if --force or missing)
#   4. Render corpus through wo-docx-renderer
#   5. Compare engines and check regression

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORPUS_DIR="${SCRIPT_DIR}/../corpus"
FORCE=""
THRESHOLD="0.05"

for arg in "$@"; do
    case "$arg" in
        --force)  FORCE="--force" ;;
        --threshold=*) THRESHOLD="${arg#*=}" ;;
        -h|--help)
            echo "Usage: $0 [--force] [--threshold=0.05]"
            exit 0
            ;;
    esac
done

# Step 1: Build
# scripts/ → wo-conformance/ → crates/ → core/ → server/ = project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
echo "=== Step 1: Build wo-render-ir ==="
(cd "$PROJECT_ROOT" && cargo build -p wo-docx-renderer --bin wo-render-ir --quiet)

BIN="$PROJECT_ROOT/target/debug/wo-render-ir"

# Step 2: Generate corpus
echo "=== Step 2: Generate corpus ==="
if [ -n "$FORCE" ] || ! ls "$CORPUS_DIR/cases/"*.docx 1>/dev/null 2>&1; then
    python3 "$SCRIPT_DIR/generate-corpus.py" "$CORPUS_DIR/cases"
else
    echo "Corpus exists — skip (use --force to regenerate)"
fi

# Step 3: Capture truth
echo "=== Step 3: Capture truth from LibreOffice ==="
python3 "$SCRIPT_DIR/capture-truth.py" capture "$CORPUS_DIR" ${FORCE:+--force}

# Step 4: Render through wo-docx-renderer
echo "=== Step 4: Render through wo-docx-renderer ==="
FAILED=0
for docx in "$CORPUS_DIR"/cases/*.docx; do
    stem="$(basename "$docx" .docx)"
    out="$CORPUS_DIR/cases/${stem}.engine.json"
    if [ -z "$FORCE" ] && [ -f "$out" ] && [ "$out" -nt "$docx" ]; then
        continue  # skip if up-to-date
    fi
    if "$BIN" "$docx" "$out" 2>/dev/null; then
        pages=$(python3 -c "import json; print(len(json.load(open('$out'))['pages']))")
        boxes=$(python3 -c "import json; print(sum(len(p['boxes']) for p in json.load(open('$out'))['pages']))")
        echo "  $stem: $pages page(s), $boxes box(es)"
    else
        echo "  $stem: FAILED" >&2
        FAILED=$((FAILED+1))
    fi
done
if [ "$FAILED" -gt 0 ]; then
    echo "WARNING: $FAILED cases failed to render" >&2
fi

# Step 5: Compare
echo ""
echo "=== Step 5: Cross-engine comparison ==="
python3 "$SCRIPT_DIR/capture-truth.py" compare "$CORPUS_DIR"

echo ""
echo "=== Regression check ==="
python3 "$SCRIPT_DIR/capture-truth.py" regression "$CORPUS_DIR" --threshold "$THRESHOLD"
