#!/usr/bin/env bash
# Gate: tools module (wordCount, setDocumentLanguage, draw-language-select, toggleSpellCheck).
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/tools.cjs
