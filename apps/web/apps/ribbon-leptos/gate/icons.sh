#!/usr/bin/env bash
# Gate: generated Lucide SVG icons. Runs the staleness check, then a Playwright probe that every
# [data-icon] renders a real <svg> with shapes on every tab. Run from anywhere inside the repo.
cd "$(git rev-parse --show-toplevel)" && node tools/gen-lucide-icons.mjs --check && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/icons.cjs
