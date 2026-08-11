#!/usr/bin/env bash
# common.sh — shared constants and helpers for wo-orchestrator.
# Sourced by all other lib/*.sh and orchestrator.sh. Do not execute directly.

set -uo pipefail

# ---------------------------------------------------------------------------
# Paths (resolve relative to this file so the script is location-independent)
# ---------------------------------------------------------------------------
WO_ORCH_DIR="${WO_ORCH_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WO_CONFIG_DIR="${WO_CONFIG_DIR:-$WO_ORCH_DIR/config}"
WO_STATE_DIR="${WO_STATE_DIR:-$WO_ORCH_DIR/state}"
WO_LOG_DIR="${WO_LOG_DIR:-$WO_STATE_DIR/logs}"
WO_PROMPT_DIR="${WO_PROMPT_DIR:-$WO_ORCH_DIR/prompts}"

# The git repo we edit. Located by walking up from the server/ checkout.
# server/ is the repo root (has its own .git, separate from workspace plan/).
WO_REPO_DIR="${WO_REPO_DIR:-$(cd "$WO_ORCH_DIR/../../.." && pwd)}"

# Worktrees live OUTSIDE the repo to avoid polluting status. .wo-worktrees/
# is gitignored at repo root.
WO_WORKTREE_ROOT="${WO_WORKTREE_ROOT:-$WO_REPO_DIR/.wo-worktrees}"

# Config files
WORKERS_JSON="$WO_CONFIG_DIR/workers.json"
TASKS_JSON="$WO_CONFIG_DIR/tasks.json"
STATUS_JSON="$WO_STATE_DIR/task-status.json"
RUNSTATE_JSON="$WO_STATE_DIR/run-state.json"   # pid/workers-in-use, transient

# Branch prefix for agent work
WO_BRANCH_PREFIX="${WO_BRANCH_PREFIX:-agent}"

# Ensure runtime dirs exist
mkdir -p "$WO_STATE_DIR" "$WO_LOG_DIR" "$WO_WORKTREE_ROOT"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
wo_log() {
  local level="$1"; shift
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s [%s] %s\n' "$ts" "$level" "$*" >&2
}
wo_info()  { wo_log "INFO"  "$@"; }
wo_warn()  { wo_log "WARN"  "$@"; }
wo_error() { wo_log "ERROR" "$@"; }

# ---------------------------------------------------------------------------
# JSON helpers (require jq)
# ---------------------------------------------------------------------------
wo_require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    wo_error "jq is required but not on PATH. Install: apt install jq"
    return 1
  fi
}

# Read a field from tasks.json for a given task id (raw, preserving type).
#   wo_task_field <task_id> <jq_path>   e.g. wo_task_field DM-3 .accept
wo_task_field() {
  jq -r --arg id "$1" '.tasks[] | select(.id==$id) | '"$2" "$TASKS_JSON"
}

# Get the full task object as JSON
wo_task_json() {
  jq --arg id "$1" '.tasks[] | select(.id==$id)' "$TASKS_JSON"
}

# List all task ids
wo_all_task_ids() {
  jq -r '.tasks[].id' "$TASKS_JSON"
}

# Worker lookup: wo_worker <name> → JSON object
wo_worker() {
  jq --arg name "$1" '.workers[] | select(.name==$name and .enabled==true)' "$WORKERS_JSON"
}

wo_worker_field() {
  jq -r --arg name "$1" '.workers[] | select(.name==$name) | '"$2" "$WORKERS_JSON"
}

# List enabled worker names
wo_worker_names() {
  jq -r '.workers[] | select(.enabled==true) | .name' "$WORKERS_JSON"
}

# Default config value
wo_default() {
  jq -r --arg k "$1" '.defaults[$k] // empty' "$WORKERS_JSON"
}
