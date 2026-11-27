#!/usr/bin/env bash
# Gate: OPS-VIEW view ops module (host-side zoom, fit-to-width/page, dark document). Run from anywhere.
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/view.cjs
