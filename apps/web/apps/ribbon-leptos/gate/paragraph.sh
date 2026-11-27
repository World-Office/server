#!/usr/bin/env bash
# Gate: paragraph ops module. Run from anywhere inside the repo.
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/paragraph.cjs
