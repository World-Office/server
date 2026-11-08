#!/usr/bin/env bash
# make-editor-ui.sh — stage the editor-ui bundle for a legion deploy.
#
# Prod (legion, opencloud-compose) serves editor UI from
# ~/editor-ui-<sha>/{word,sheet,slide,diagram,pdf} via ro compose mounts.
# There is NO automated deploy (see .github/workflows/deploy.yml NOTE):
# production is VPN-only, GitHub runners cannot reach it.
#
# word/  = the vanilla wysiwyg app, 5 runtime files from the repo source
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
WYS="$REPO/apps/web/apps/documenteditor-wysiwyg"
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
for d in sheet slide diagram pdf; do
  [ -d "$STAGE/$d" ] || { echo "missing $d in artifact" >&2; exit 1; }
done
mkdir -p "$STAGE/word"
cp "$WYS"/index.html "$WYS"/editor.js "$WYS"/i18n.js "$WYS"/style.css "$WYS"/wo-bridge.js "$STAGE/word/"
printf '{"sha":"%s","builtAt":"%s"}\n' "$SHA" "$(date -u +%F)" > "$STAGE/build-info.json"
for d in word sheet slide diagram pdf; do cp "$STAGE/build-info.json" "$STAGE/$d/build-info.json"; done

cat <<EOF
staged: $STAGE
deploy:
  rsync -a $STAGE/ legion-vpn:~/editor-ui-$SHA/
  ssh legion-vpn "sed -i 's|editor-ui-[0-9a-f]*/|editor-ui-$SHA/|g' /home/weiss/opencloud-compose/docker-compose.yml && docker compose -p opencloud-compose --project-directory /home/weiss/opencloud-compose -f /home/weiss/opencloud-compose/docker-compose.yml up -d docserver"
verify: node tests/parity/surfaces/deploy-freshness.cjs
EOF
