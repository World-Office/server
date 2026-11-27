#!/usr/bin/env bash
# Gate: the Leptos ribbon renders the full generated spec and a click reaches the engine through the
# same wasm module. Run from anywhere inside the repo. Needs playwright (WO_E2E_NODE_MODULES).
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/port.cjs
