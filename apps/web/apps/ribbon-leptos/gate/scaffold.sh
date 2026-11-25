#!/usr/bin/env bash
# Gate: the scaffold builds and mounts. Run from anywhere inside the repo.
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/scaffold.cjs
