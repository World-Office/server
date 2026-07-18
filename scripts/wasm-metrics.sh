#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# wasm-metrics.sh — Measure and report WASM binary sizes and compile times.
#
# Called from CI (wasm.yml) after each WASM build step.
# Outputs metrics in a machine-readable JSON format and human-readable summary.
#
# Usage:
#   ./scripts/wasm-metrics.sh <crate-name> <build-dir>
#
# Example:
#   ./scripts/wasm-metrics.sh wo-x2t-wasm core/crates/wo-x2t-wasm
#   ./scripts/wasm-metrics.sh wo-renderer-wasm core/crates/wo-renderer-wasm
# ---------------------------------------------------------------------------
set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: $0 <crate-name> <build-dir>"
    exit 1
fi

CRATE_NAME="$1"
BUILD_DIR="$2"

# --- Locate WASM binary ------------------------------------------------
# cargo build --target wasm32-unknown-unknown puts output under target/wasm32-unknown-unknown/debug/
# or target/wasm32-unknown-unknown/release/ depending on profile.
TARGET_DIR="target/wasm32-unknown-unknown"
WASM_FILE=""

# Try release first, then debug
for profile in release debug; do
    candidate="$TARGET_DIR/$profile/${CRATE_NAME//-/_}.wasm"
    if [ -f "$candidate" ]; then
        WASM_FILE="$candidate"
        BUILD_PROFILE="$profile"
        break
    fi
done

# Fallback: search for .wasm files in the target directory
if [ -z "$WASM_FILE" ]; then
    WASM_FILE=$(find "$TARGET_DIR" -name "${CRATE_NAME//-/_}.wasm" -type f 2>/dev/null | head -1)
    BUILD_PROFILE="unknown"
fi

# --- Measure sizes -----------------------------------------------------
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -n "$WASM_FILE" ]; then
    SIZE_BYTES=$(stat --printf="%s" "$WASM_FILE" 2>/dev/null || stat -f"%z" "$WASM_FILE" 2>/dev/null)
    SIZE_KB=$(echo "scale=2; $SIZE_BYTES / 1024" | bc)
    SIZE_MB=$(echo "scale=3; $SIZE_BYTES / 1048576" | bc)
else
    SIZE_BYTES=0
    SIZE_KB=0
    SIZE_MB=0
    WASM_FILE="(not found)"
fi

# --- Measure compile time from Cargo build output -----------------------
# We attempt to extract compile time from the build dir's modification timestamp
# vs. the WASM file's modification timestamp.
COMPILE_TIME_S=0
if [ -n "$WASM_FILE" ] && [ "$WASM_FILE" != "(not found)" ]; then
    BUILD_DIR_MTIME=$(stat --printf="%Y" "$BUILD_DIR" 2>/dev/null || stat -f"%m" "$BUILD_DIR" 2>/dev/null)
    WASM_MTIME=$(stat --printf="%Y" "$WASM_FILE" 2>/dev/null || stat -f"%m" "$WASM_FILE" 2>/dev/null)
    if [ -n "$BUILD_DIR_MTIME" ] && [ -n "$WASM_MTIME" ]; then
        COMPILE_TIME_S=$(( WASM_MTIME - BUILD_DIR_MTIME ))
        # Clamp to positive
        [ "$COMPILE_TIME_S" -lt 0 ] && COMPILE_TIME_S=0
    fi
fi

# --- Determine if wasm-pack pkg exists ---------------------------------
WASM_PKG_DIR="$BUILD_DIR/pkg"
if [ -d "$WASM_PKG_DIR" ]; then
    PKG_SIZE_BYTES=$(find "$WASM_PKG_DIR" -type f -exec stat --printf="%s" {} + 2>/dev/null | paste -sd+ | bc || echo 0)
    PKG_SIZE_KB=$(echo "scale=2; $PKG_SIZE_BYTES / 1024" | bc)
else
    PKG_SIZE_BYTES=0
    PKG_SIZE_KB=0
fi

# --- Output JSON -------------------------------------------------------
cat <<JSON
{
  "crate": "$CRATE_NAME",
  "timestamp": "$NOW",
  "wasm_file": "$WASM_FILE",
  "build_profile": "$BUILD_PROFILE",
  "size_bytes": $SIZE_BYTES,
  "size_kb": $SIZE_KB,
  "size_mb": $SIZE_MB,
  "compile_time_seconds": $COMPILE_TIME_S,
  "pkg_size_bytes": $PKG_SIZE_BYTES,
  "pkg_size_kb": $PKG_SIZE_KB
}
JSON

# --- Human-readable summary to stderr ----------------------------------
echo "--- WASM Metrics: $CRATE_NAME ---" >&2
echo "  Binary:      $WASM_FILE" >&2
echo "  Profile:     $BUILD_PROFILE" >&2
echo "  Size:        ${SIZE_KB} KB (${SIZE_MB} MB)" >&2
echo "  Compile:     ${COMPILE_TIME_S}s" >&2
if [ "$PKG_SIZE_BYTES" -gt 0 ]; then
    echo "  wasm-pkg:    ${PKG_SIZE_KB} KB" >&2
fi
echo "----------------------------------" >&2
