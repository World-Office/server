#!/bin/sh
set -e

cd "$(git rev-parse --show-toplevel)/apps/web/apps/ribbon-leptos"

# Run cargo test, capture output
OUTPUT_FILE=$(mktemp)
cargo test --lib -- --nocapture > "$OUTPUT_FILE" 2>&1 || true

# Print last 25 lines
echo "=== Last 25 lines of cargo test output ==="
tail -n 25 "$OUTPUT_FILE"

# Check if tests passed and the expected line is present
if grep -q "test result: ok" "$OUTPUT_FILE" && \
   grep -q "HOME_SPEC groups=5 controls=40 large=13 toggled=13" "$OUTPUT_FILE"; then
    echo "SPEC OK"
    exit 0
else
    echo "SPEC FAILED"
    exit 1
fi
