#!/usr/bin/env bash
# orchestrator.sh — main loop for wo-orchestrator.
#
# Continuously dispatches ready tasks to free workers until all are done (or
# permanently failed / blocked). Each worker runs in an isolated git worktree.
#
# Usage:
#   orchestrator.sh                 # run until done
#   orchestrator.sh --once          # one dispatch round, then exit
#   orchestrator.sh --dry-run       # show what would run, change nothing
#   orchestrator.sh --status        # print the status board and exit
#   orchestrator.sh --worker NAME   # restrict to a single worker
#   orchestrator.sh --task ID       # dispatch exactly one task (ignore others)
#   orchestrator.sh --poll SECONDS  # sleep between rounds (default 15)
#
# Env:
#   WO_MAX_PARALLEL  (default = number of enabled workers)
#   WO_MAX_ROUNDS    (default unlimited)
#   WO_MERGE_LOCK    (default state/merge.lock)

set -uo pipefail

WO_ORCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$WO_ORCH_DIR/lib/common.sh"
# shellcheck source=lib/status.sh
. "$WO_ORCH_DIR/lib/status.sh"
# shellcheck source=lib/worktree.sh
. "$WO_ORCH_DIR/lib/worktree.sh"
# shellcheck source=lib/dispatch.sh
. "$WO_ORCH_DIR/lib/dispatch.sh"

wo_require_jq || exit 1
command -v pi >/dev/null 2>&1       || { wo_error "pi not on PATH"; exit 1; }
git -C "$WO_REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || { wo_error "WO_REPO_DIR ($WO_REPO_DIR) is not a git repository. Set WO_REPO_DIR to the repo root."; exit 1; }

# --- Startup cleanup: ensure main worktree is pristine ---
# Failed merges or interrupted runs can leave modified tracked files and
# untracked artifacts in the main checkout. These block subsequent merges
# ("Your local changes would be overwritten") and cascade into deadlocks.
# worktrees/ and state/ are gitignored, so git clean won't touch them.
(
  cd "$WO_REPO_DIR"
  git checkout --quiet main 2>/dev/null || true
  if [[ -n "$(git status --porcelain)" ]]; then
    wo_warn "main worktree was dirty at startup — cleaning"
    git reset --hard --quiet HEAD
    git clean --quiet -fd
  fi
)

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
WO_MODE="run"            # run|once|dry-run|status
WO_POLL=15
WO_WORKER_FILTER=""
WO_TASK_FILTER=""
WO_MAX_ROUNDS=0          # 0 = unlimited
WO_MAX_PARALLEL="${WO_MAX_PARALLEL:-$(wo_worker_names | wc -l)}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --once)     WO_MODE="once"; shift ;;
    --dry-run)  WO_MODE="dry-run"; shift ;;
    --status)   WO_MODE="status"; shift ;;
    --worker)   WO_WORKER_FILTER="$2"; shift 2 ;;
    --task)     WO_TASK_FILTER="$2"; shift 2 ;;
    --poll)     WO_POLL="$2"; shift 2 ;;
    --max-rounds) WO_MAX_ROUNDS="$2"; shift 2 ;;
    --max-parallel) WO_MAX_PARALLEL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) wo_error "unknown arg: $1"; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------
wo_status_init

if [[ "$WO_MODE" == "status" ]]; then
  wo_status_board
  exit 0
fi

WO_MERGE_LOCK="${WO_MERGE_LOCK:-$WO_STATE_DIR/merge.lock}"
mkdir -p "$WO_STATE_DIR"

wo_info "wo-orchestrator starting — mode=$WO_MODE poll=${WO_POLL}s parallel=$WO_MAX_PARALLEL"

# ---------------------------------------------------------------------------
# Worker availability: a worker is free iff not currently assigned to a
# running/verifying task. We track in-process pids in run-state.json.
# ---------------------------------------------------------------------------
wo_runstate_init() {
  [[ -f "$RUNSTATE_JSON" ]] || echo '{}' > "$RUNSTATE_JSON"
}

# record a running task: wo_runstate_set <task_id> <pid> <worker>
wo_runstate_set() {
  local id="$1" pid="$2" worker="$3"
  local tmp
  tmp="$(mktemp)"
  jq --arg id "$id" --arg pid "$pid" --arg w "$worker" \
    '.[$id] = {pid: ($pid|tonumber), worker: $w, started: now | todate}' \
    "$RUNSTATE_JSON" > "$tmp"
  mv "$tmp" "$RUNSTATE_JSON"
}

# remove a task from run-state
wo_runstate_clear() {
  local id="$1"
  local tmp
  tmp="$(mktemp)"
  jq --arg id "$id" 'del(.[$id])' "$RUNSTATE_JSON" > "$tmp"
  mv "$tmp" "$RUNSTATE_JSON"
}

# list worker names currently busy
wo_busy_workers() {
  wo_require_jq || return 1
  jq -r '[.[] | .worker] | unique | .[]' "$RUNSTATE_JSON" 2>/dev/null
}

# count in-flight tasks
wo_inflight_count() {
  jq 'length' "$RUNSTATE_JSON" 2>/dev/null || echo 0
}

# A worker is free if enabled, in filter, and not busy.
wo_free_workers() {
  local busy
  busy="$(wo_busy_workers)"
  while IFS= read -r w; do
    [[ -z "$w" ]] && continue
    [[ -n "$WO_WORKER_FILTER" && "$w" != "$WO_WORKER_FILTER" ]] && continue
    # not in busy list?
    if ! grep -qxF "$w" <<< "$busy"; then
      echo "$w"
    fi
  done < <(wo_worker_names)
}

# ---------------------------------------------------------------------------
# Reap finished background dispatches.
# ---------------------------------------------------------------------------
wo_reap() {
  local id pid status
  # iterate over a snapshot so we can mutate run-state
  local ids
  ids="$(jq -r 'keys[]' "$RUNSTATE_JSON" 2>/dev/null)" || return 0
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    pid="$(jq -r --arg id "$id" '.[$id].pid' "$RUNSTATE_JSON")"
    if ! kill -0 "$pid" 2>/dev/null; then
      # process finished — wait to reap zombie + get status
      wait "$pid" 2>/dev/null
      local rc=$?
      status="$(wo_status_get "$id" .status)"
      wo_info "reaped $id (pid $pid, rc=$rc, status=$status)"
      wo_runstate_clear "$id"
    fi
  done <<< "$ids"
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
wo_run() {
  local round=0
  while true; do
    round=$((round + 1))
    wo_reap

    # termination check
    local done_n failed_n running_n ready_n total_n
    done_n="$(wo_count_status done)"
    failed_n="$(wo_count_status failed)"
    running_n="$(wo_count_status running)"
    total_n="$(jq '[to_entries[] | select(.value | type=="object" and has("status"))] | length' "$STATUS_JSON")"

    wo_info "round $round — done=$done_n failed=$failed_n running=$running_n total=$total_n"

    if [[ $done_n -eq $total_n ]]; then
      wo_info "ALL TASKS DONE 🎉"
      wo_status_board
      return 0
    fi

    # detect deadlock: nothing running, nothing ready, not all done
    local ready_ids
    if [[ -n "$WO_TASK_FILTER" ]]; then
      wo_is_ready "$WO_TASK_FILTER" && ready_ids="$WO_TASK_FILTER" || ready_ids=""
    else
      ready_ids="$(wo_ready_task_ids)"
    fi
    local inflight
    inflight="$(wo_inflight_count)"

    if [[ -z "$ready_ids" && "$inflight" -eq 0 ]]; then
      # nothing dispatchable and nothing in flight
      if [[ $failed_n -gt 0 ]]; then
        wo_error "DEADLOCK: $failed_n task(s) failed, none ready, none running. Exiting."
        wo_status_board
        return 1
      else
        # all done except blocked (shouldn't happen if deps resolve)
        wo_warn "no ready or running tasks but not all done — possible blocked dependency"
        wo_status_board
        return 1
      fi
    fi

    # dispatch: pair ready tasks with free workers, up to WO_MAX_PARALLEL
    if [[ "$WO_MODE" == "dry-run" ]]; then
      local printed=0
      while IFS= read -r tid; do
        [[ -z "$tid" ]] && continue
        # pick first free worker for display
        local fw
        fw="$(wo_free_workers | head -1)"
        wo_dispatch_one_dryrun "$tid" "${fw:-<any>}"
        printed=$((printed + 1))
      done <<< "$ready_ids"
      [[ $printed -eq 0 ]] && wo_info "(no ready tasks right now)"
      return 0
    fi

    while IFS= read -r tid; do
      [[ -z "$tid" ]] && continue
      [[ "$inflight" -ge "$WO_MAX_PARALLEL" ]] && break
      local fw
      fw="$(wo_free_workers | head -1)"
      [[ -z "$fw" ]] && { wo_info "no free workers, waiting"; break; }
      # dispatch in background. Fine-grained locks (status + merge) protect
      # the shared state; the long pi run is fully parallel across worktrees.
      wo_dispatch_one "$tid" "$fw" &
      local bg_pid=$!
      wo_runstate_set "$tid" "$bg_pid" "$fw"
      wo_info "launched $tid on worker=$fw (pid $bg_pid)"
      inflight=$((inflight + 1))
      sleep 1   # stagger launches so worktree creation doesn't race
    done <<< "$ready_ids"
    if [[ "$WO_MODE" == "once" ]]; then
      wo_info "--once: dispatched one round, exiting"
      return 0
    fi
    if [[ "$WO_MAX_ROUNDS" -gt 0 && "$round" -ge "$WO_MAX_ROUNDS" ]]; then
      wo_info "reached --max-rounds $WO_MAX_ROUNDS, exiting"
      return 0
    fi

    sleep "$WO_POLL"
  done
}

wo_runstate_init
wo_run
