#!/usr/bin/env bash
# Gate: IME bridge receives REAL composition events via CDP. Run from anywhere inside the repo.
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/ime.cjs
