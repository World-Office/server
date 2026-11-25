#!/usr/bin/env bash
# Gate: L1-04 RibbonGroup + control kinds. Run from anywhere inside the repo.
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/group.cjs
