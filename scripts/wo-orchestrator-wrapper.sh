#!/usr/bin/env bash
# wo-orchestrator — World-Office wrapper around taskfleet.
#
# Sources the taskfleet engine with World-Office-specific configuration:
#   - TF_REPO_DIR points to server/
#   - TF_GATE_ENV injects RUSTUP_TOOLCHAIN=nightly (and pdfium paths for wo-pdf-render gates)
#   - TF_CONFIG_DIR/STATE/LOG/PROMPT all point into wo-orchestrator/

set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SELF/taskfleet"

# World-Office repo root (scripts/.. == server/)
export TF_REPO_DIR="$(cd "$SELF/.." && pwd)"

# Rust project needs nightly for wasm-pack; pdfium lib path for wo-pdf-render gates
PDFIUM_DIR="$HOME/.cargo/pdfium-vendored/7881/linux-x86_64"
if [[ -d "$PDFIUM_DIR" ]]; then
  export TF_GATE_ENV="RUSTUP_TOOLCHAIN=nightly PDFIUM_DYNAMIC_LIB_PATH=$PDFIUM_DIR/libpdfium.so LD_LIBRARY_PATH=$PDFIUM_DIR"
else
  export TF_GATE_ENV="RUSTUP_TOOLCHAIN=nightly"
fi

# Use WO-specific task and worker configs (override taskfleet's examples)
export TF_CONFIG_DIR="$SELF/wo-orchestrator/config"
export TF_STATE_DIR="$SELF/wo-orchestrator/state"
export TF_LOG_DIR="$SELF/wo-orchestrator/state/logs"
export TF_PROMPT_DIR="$SELF/wo-orchestrator/prompts"

# Delegate everything to taskfleet's orchestrator
exec "$TF_DIR/orchestrator.sh" "$@"
