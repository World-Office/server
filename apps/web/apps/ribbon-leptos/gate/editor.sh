#!/usr/bin/env bash
# Gate: the canvas host paints pages from the engine and input reaches the document (click → caret,
# typed text incl. non-ASCII, IME commit, select-all, ribbon → repaint, Tab not trapped).
# Run from anywhere inside the repo. Needs playwright (WO_E2E_NODE_MODULES).
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/editor.cjs
