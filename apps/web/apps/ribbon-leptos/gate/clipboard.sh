#!/usr/bin/env bash
# Gate: ribbon ops clipboard — cut/copy/paste/selectAll/copyStyle through the REAL async browser
# clipboard (permissions granted to the probe context). Run from anywhere inside the repo.
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/clipboard.cjs
