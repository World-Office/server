#!/usr/bin/env bash
# make-editor-ui.sh — stage the editor-ui bundle for a legion deploy.
#
# Prod (legion, opencloud-compose) serves editor UI from
# ~/editor-ui-<sha>/{word,sheet,slide,diagram,pdf} via ro compose mounts. The
# compose file points at ~/editor-ui-latest, a SYMLINK to the release dir —
# a flip re-points the symlink and recreates the container (the mounts of a
# running container are fixed at creation). Never cp/rm through the symlink:
# `cp -a ~/editor-ui-latest ~/editor-ui-<new>` copies the LINK, and the next
# rm -rf lands in the live release (2026-11-25: that cost the 3c8c1f9 bundle).
# There is NO automated deploy (see .github/workflows/deploy.yml NOTE):
# production is VPN-only, GitHub runners cannot reach it.
#
# word/  = the React canvas editor (documenteditor-react), vite build from
#          the tree (see build-word() below). The vanilla wysiwyg app
#          (python-lineage, contenteditable) was RETIRED as the deployed
#          editor on 2026-11-16 and moved to branch
#          legacy/wysiwyg-python-editor (with its 159-test gate suite).
# sheet|slide|diagram|pdf = vite builds from the latest green Deploy run
#          (`gh api repos/:owner/:repo/actions/runs/<id>/artifacts`,
#           artifact name "frontend-dist")
#
# Every dir gets build-info.json {sha} — deploy-freshness.cjs gates on it.
#
# Usage: tests/parity/make-editor-ui.sh <sha7> <artifact-zip|artifact-id>
#   <artifact-zip>  already-downloaded frontend-dist zip (default: fetch by id)
# Output: ~/editor-ui-<sha>/ on legion, plus flip instructions.
set -euo pipefail
SHA="${1:?usage: make-editor-ui.sh <sha7> [artifact-zip|artifact-id]}"
ZIP="${2:-}"
REPO="$(git rev-parse --show-toplevel)"
STAGE="/tmp/editor-ui-$SHA"

rm -rf "$STAGE" && mkdir -p "$STAGE"
if [ -n "$ZIP" ] && [ -f "$ZIP" ]; then
  /usr/bin/python3 - "$ZIP" "$STAGE" <<'EOF'
import sys, zipfile, json, pathlib
zip_path, stage = sys.argv[1], sys.argv[2]
zipfile.ZipFile(zip_path).extractall(stage)
EOF
else
  echo "usage: make-editor-ui.sh <sha7> <frontend-dist.zip>" >&2
  echo "  fetch: cd $REPO/server && gh api repos/:owner/:repo/actions/runs/<deploy-run-id>/artifacts" >&2
  exit 1
fi
build_word() {
  local OUT="$1"
  (cd "$REPO/apps/web/apps/documenteditor-react" && pnpm install --frozen-lockfile >/dev/null 2>&1; pnpm build >/dev/null) \
    || { echo "word react build failed" >&2; exit 1; }
  mkdir -p "$OUT/word" && rm -rf "$OUT/word"/*
  cp -r "$REPO/apps/web/apps/documenteditor-react/dist/." "$OUT/word/"
}
# guard: refuse to ship a zip-stale word/ when --build-word was requested —
# the artifact's word/ is CI-built and can lag HEAD by a full day.
if [[ " $* " == *" --build-word "* ]]; then build_word "$STAGE"; fi
# (default, no --build-word: word/ comes from the artifact zip — CI builds it)
for d in sheet slide diagram pdf; do
  [ -d "$STAGE/$d" ] || { echo "missing $d in artifact" >&2; exit 1; }
done
# word/ comes from build_word (--build-word) or the artifact zip — nothing
# to copy from the tree since the wysiwyg retirement.
mkdir -p "$STAGE/word"
printf '{"sha":"%s","builtAt":"%s"}\n' "$SHA" "$(date -u +%F)" > "$STAGE/build-info.json"
for d in word sheet slide diagram pdf; do cp "$STAGE/build-info.json" "$STAGE/$d/build-info.json"; done

cat <<EOF
staged: $STAGE
deploy:
  ssh legion-vpn "test ! -e ~/editor-ui-$SHA"            # new release dir, never write through an existing one
  rsync -a $STAGE/ legion-vpn:~/editor-ui-$SHA/
  ssh legion-vpn "ln -sfn editor-ui-$SHA editor-ui-latest && docker compose -p opencloud-compose --project-directory /home/weiss/opencloud-compose -f /home/weiss/opencloud-compose/docker-compose.yml up -d --no-deps docserver"
verify: node tests/parity/surfaces/deploy-freshness.cjs
EOF
