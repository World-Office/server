#!/usr/bin/env bash
# Gate: ribbon/ops find & replace — real match count, honest replace, intact document, caret kept.
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/find.cjs
