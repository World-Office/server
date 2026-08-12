#!/usr/bin/env bash
# wo-orchestrator — World-Office wrapper around taskfleet.
#
# Sources the taskfleet engine with World-Office-specific configuration:
#   - TF_REPO_DIR points to server/
#   - TF_GATE_ENV injects RUSTUP_TOOLCHAIN=nightly for wasm-pack gates
#   - config/ links to WO-specific tasks.json and workers.json

set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SELF/taskfleet"

# World-Office repo root
export TF_REPO_DIR="$(cd "$SELF/../.." && pwd)"

# Rust project needs nightly for wasm-pack
export TF_GATE_ENV="RUSTUP_TOOLCHAIN=nightly"

# Use WO-specific task and worker configs (override taskfleet's examples)
export TF_CONFIG_DIR="$SELF/wo-orchestrator/config"

# Delegate everything to taskfleet's orchestrator
exec "$TF_DIR/orchestrator.sh" "$@"
