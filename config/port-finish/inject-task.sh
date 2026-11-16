#!/usr/bin/env bash
# inject-task.sh — add ONE task to the LIVE port-finish campaign (af hot-reloads
# tasks.json between rounds, ~15s poll; parse errors are refused and keep the
# last good config, so a bad task cannot kill the run).
#
# Usage:
#   inject-task.sh file.json                      # full task object
#   inject-task.sh ID "Title" "gate command" "notes for the worker"
# Writes the task into tasks.json (atomic) and logs it. Idempotent on id.
set -eu
CAMP=/home/weiss/git/World-Office/server/config/port-finish
mkdir -p "$CAMP/tasks.d"

if [ "$#" -eq 1 ]; then
  cp "$1" "$CAMP/tasks.d/manual-$(date -u +%H%M%S)-$(basename "$1" .json).json"
else
  [ "$#" -eq 4 ] || { echo "usage: inject-task.sh file.json | ID TITLE GATE NOTE" >&2; exit 2; }
  /usr/bin/python3 - "$CAMP/tasks.d/manual-$(date -u +%H%M%S)-$1.json" "$@" <<'EOF'
import json, sys
out, tid, title, gate, note = sys.argv[1:6]
json.dump({"id": tid, "title": title, "accept": gate, "note": note}, open(out, "w"), indent=1)
EOF
fi

/usr/bin/python3 "$CAMP/derive-gaps.py"   # merge drop-ins now (idempotent)
echo "injected — af picks it up on the next poll cycle; check: af status"
