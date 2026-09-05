#!/usr/bin/env bash
# Capture OnlyOffice oracle goldens for the conformance corpus.
#
# Every .docx in <corpus-dir> is converted by a running OnlyOffice Document
# Server (started by CI or manually — see onlyoffice-image.env) and projected
# into <stem>.onlyoffice.json via the Rust adapter (poppler bbox → box tree),
# so ALL engines share one geometry-projection path.
#
# Usage:
#   capture-onlyoffice.sh <corpus-dir>              # capture missing/stale goldens
#   capture-onlyoffice.sh <corpus-dir> --force      # recapture everything
#   capture-onlyoffice.sh <corpus-dir> --diff-only  # skip capture, only diff report
#
# Env: OO_DS_URL (default http://127.0.0.1:9980), OO_DS_JWT, OO_DS_PUBLIC_HOST
# (must be reachable FROM the DS container; default 172.17.0.1 = docker bridge).
#
# Divergence policy: OnlyOffice vs LibreOffice truth legitimately diverges
# (font substitution, layout quirks). Diffs are RECORDED in
# oracle-report-<timestamp>.txt, never CI-fatal. Capture errors ARE fatal.
set -euo pipefail

CORPUS_DIR="${1:?usage: capture-onlyoffice.sh <corpus-dir> [--force|--diff-only]}"
MODE="${2:-}"
FORCE=false
[ "$MODE" = "--force" ] && FORCE=true

: "${OO_DS_URL:=http://127.0.0.1:9980}"
: "${OO_DS_PUBLIC_HOST:=172.17.0.1}"
export OO_DS_URL OO_DS_JWT OO_DS_PUBLIC_HOST
export OO_DS_VERSION="$(grep OO_DS_IMAGE= "$(dirname "$0")/onlyoffice-image.env" | cut -d= -f2 | cut -c1-40)…"

BIN="$(cd "$(dirname "$0")" && pwd)/../../../../target/debug/wo-conformance"
if [ ! -x "$BIN" ]; then
  echo "building wo-conformance CLI..."
  (cd "$(dirname "$0")/../../../.." && cargo build -p wo-conformance)
fi

if [ "$MODE" != "--diff-only" ]; then
  n=0
  for docx in "$CORPUS_DIR"/*.docx; do
    stem="$(basename "$docx" .docx)"
    out="$CORPUS_DIR/$stem.onlyoffice.json"
    if [ "$FORCE" = false ] && [ -f "$out" ]; then
      continue
    fi
    echo "capturing $stem"
    "$BIN" capture --ds-url "$OO_DS_URL" --input "$docx" --out "$out"
    n=$((n + 1))
  done
  echo "captured $n goldens"
fi

report="$(dirname "$CORPUS_DIR")/oracle-report-$(date +%Y%m%d-%H%M%S).txt"
failures=0
{
  echo "OnlyOffice oracle vs reference truth — $(date -u +%FT%TZ)"
  echo "image: $(grep OO_DS_IMAGE= "$(dirname "$0")/onlyoffice-image.env" | cut -d= -f2)"
  echo
  printf '%-34s %-8s %s\n' "case" "fidelity" "engine"
  for golden in "$CORPUS_DIR"/*.onlyoffice.json; do
    stem="$(basename "$golden" .onlyoffice.json)"
    truth="$CORPUS_DIR/$stem.truth.json"
    if [ ! -f "$truth" ]; then
      printf '%-34s %-8s %s\n' "$stem" "n/a" "(no reference truth)"
      continue
    fi
    # --cross-engine: run-level scoring (engines segment boxes differently);
    # tolerant of divergence by design — divergence is data, not failure.
    line="$("$BIN" diff --cross-engine --threshold=0 "$golden" "$truth" 2>&1)" || failures=$((failures + 1))
    grep -- 'fidelity:' <<<"$line" | head -1 | awk -v s="$stem" '{printf "%-34s %s\n", s, $0}'
    tail -n +2 <<<"$line" | sed 's/^/    /'
  done
} | tee "$report"

echo
echo "report: $report (diff-engine errors: $failures)"
