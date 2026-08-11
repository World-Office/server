#!/usr/bin/env bash
# verify.sh — acceptance-gate runner for wo-orchestrator.
#
# Runs the task's `accept` command inside its worktree. Returns 0 iff green.
# Captures combined stdout+stderr to the task log.

# shellcheck source=common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# wo_verify <task_id> <worktree_path>
# Echoes "PASS" or "FAIL: <reason>". Exit code mirrors pass/fail.
wo_verify() {
  local id="$1" wt="$2"
  local accept timeout_s log
  accept="$(wo_task_field "$id" .accept)"
  timeout_s="$(wo_default accept_timeout_s)"; timeout_s="${timeout_s:-600}"
  log="$WO_LOG_DIR/$id.verify.log"

  if [[ -z "$accept" || "$accept" == "null" ]]; then
    wo_warn "$id: no accept command defined — skipping gate (manual sign-off)"
    echo "SKIP: no accept command (manual task)"
    return 0
  fi

  wo_info "$id: running acceptance gate (${timeout_s}s): $accept"
  {
    echo "=== $id acceptance gate: $accept ==="
    echo "=== worktree: $wt ==="
    echo "=== started: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  } > "$log"

  # Run in the worktree with the workspace root on the path (for openspec CLI).
  # Use a subshell + timeout. cargo/pnpm/wasm-pack must be on PATH already.
  local rc=0
  (
    cd "$wt" || exit 127
    # export so openspec/wo commands resolve; server/ is the CWD inside worktree
    timeout "$timeout_s" bash -lc "$accept"
  ) >> "$log" 2>&1 || rc=$?

  if [[ $rc -eq 0 ]]; then
    wo_info "$id: gate PASS"
    echo "PASS"
    return 0
  elif [[ $rc -eq 124 ]]; then
    wo_error "$id: gate TIMEOUT after ${timeout_s}s"
    echo "FAIL: timeout after ${timeout_s}s"
    return 1
  else
    wo_error "$id: gate FAIL (exit $rc) — see $log"
    echo "FAIL: exit $rc (see $log)"
    return 1
  fi
}

# wo_verify_scope <task_id> <worktree_path>
#   Advisory check: did the worker edit only in-scope files? Prints warnings
#   for out-of-scope edits but does NOT fail the task (the acceptance gate is
#   authoritative). Helps catch scope drift.
wo_verify_scope() {
  local id="$1" wt="$2"
  local log="$WO_LOG_DIR/$id.scope.log"
  {
    echo "=== $id scope check ==="
  } > "$log"

  # files changed vs main on the task branch
  local changed
  changed="$(cd "$wt" && git diff --name-only main...HEAD 2>/dev/null)" || true
  [[ -z "$changed" ]] && { echo "none"; return 0; }

  # allowed globs
  local allowed
  allowed="$(wo_task_field "$id" '.scope[]')" || true

  local violations=()
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local ok=0
    # match against scope globs (prefix or shell glob)
    while IFS= read -r pat; do
      [[ -z "$pat" ]] && continue
      # treat trailing / as "directory and below"
      case "$pat" in
        */) [[ "$f" == "$pat"* ]] && ok=1 ;;
        *)  [[ "$f" == "$pat" ]] && ok=1 ;;
      esac
    done <<< "$allowed"
    [[ $ok -eq 0 ]] && violations+=("$f")
  done <<< "$changed"

  if [[ ${#violations[@]} -gt 0 ]]; then
    {
      echo "OUT-OF-SCOPE edits (advisory, non-blocking):"
      printf '  %s\n' "${violations[@]}"
    } >> "$log"
    wo_warn "$id: ${#violations[@]} out-of-scope file(s) edited — see $log"
    printf '%s\n' "${violations[@]}"
  else
    echo "all in-scope" >> "$log"
  fi
}
