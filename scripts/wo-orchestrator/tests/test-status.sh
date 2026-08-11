#!/usr/bin/env bash
# test-status.sh — task status machine: init, ready detection, dep blocking,
# fail→retry→ready cooldown, done propagation.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/test-harness.sh"

# Isolated sandbox: temp config + state
SBOX="$(mktemp -d)"
trap 'rm -rf "$SBOX"' EXIT
export WO_CONFIG_DIR="$SBOX/config"
export WO_STATE_DIR="$SBOX/state"
export WO_LOG_DIR="$SBOX/logs"
mkdir -p "$WO_CONFIG_DIR" "$WO_STATE_DIR" "$WO_LOG_DIR"

# Minimal dependency graph: A (none) → B (A) → C (A,B); plus isolated D.
cat > "$WO_CONFIG_DIR/tasks.json" <<'JSON'
{
  "_meta": {"task_count": 4},
  "tasks": [
    {"id":"A","engine":"t","title":"A","section":"§1","deps":[],"scope":["x.rs"],"accept":"true","manual":false},
    {"id":"B","engine":"t","title":"B","section":"§1","deps":["A"],"scope":["y.rs"],"accept":"true","manual":false},
    {"id":"C","engine":"t","title":"C","section":"§1","deps":["A","B"],"scope":["z.rs"],"accept":"true","manual":false},
    {"id":"D","engine":"t","title":"D","section":"§1","deps":[],"scope":["w.rs"],"accept":"true","manual":false}
  ]
}
JSON
cat > "$WO_CONFIG_DIR/workers.json" <<'JSON'
{"workers":[{"name":"w1","provider":"p","model":"m","enabled":true}],
 "defaults":{"dispatch_timeout_s":30,"accept_timeout_s":10,"max_attempts":2,"retry_cooldown_s":1}}
JSON

. "$HERE/../lib/common.sh"
. "$HERE/../lib/status.sh"

echo "=== Status machine tests ==="

wo_group_begin; wo_test "init creates ready entries for all tasks"
wo_status_init
wo_assert_eq "status file has 4 tasks" "4" "$(jq 'length' "$STATUS_JSON")"
wo_assert_eq "A status" "ready" "$(wo_status_get A .status)"
wo_assert_eq "B status" "ready" "$(wo_status_get B .status)"
wo_assert_eq "D attempts" "0" "$(wo_status_get D .attempts)"
wo_group_end

wo_group_begin; wo_test "ready detection respects deps"
# A and D have no deps → ready. B needs A (not done) → not ready. C needs A,B → not ready.
wo_assert "A is ready"        wo_is_ready A
wo_assert "D is ready"        wo_is_ready D
wo_assert_not "B is NOT ready"    wo_is_ready B
wo_assert_not "C is NOT ready"    wo_is_ready C
local_a="$(wo_ready_task_ids)"
wo_assert_eq "ready set = A,D" "$(echo -e 'A\nD' | sort)" "$(echo "$local_a" | sort)"
wo_group_end

wo_group_begin; wo_test "done propagates: after A done, B becomes ready"
wo_done_task A
wo_assert_eq "A done" "done" "$(wo_status_get A .status)"
wo_assert "B is now ready"  wo_is_ready B
wo_assert_not "C is NOT ready (still needs B)"  wo_is_ready C
wo_group_end

wo_group_begin; wo_test "chain completion: B done → C ready → C done"
wo_done_task B
wo_assert "C is now ready"  wo_is_ready C
wo_done_task C
wo_assert_eq "C done" "done" "$(wo_status_get C .status)"
wo_group_end

wo_group_begin; wo_test "fail → retry cooldown → ready again (under max_attempts=2)"
# D fails once: attempts 1/2, scheduled retry, NOT ready until cooldown passes
wo_fail_task D "synthetic failure 1"
wo_assert_eq "D attempts after 1 fail" "1" "$(wo_status_get D .attempts)"
wo_assert_eq "D status" "failed" "$(wo_status_get D .status)"
# immediately after, still within cooldown → not ready
wo_assert_not "D NOT ready immediately after fail"  wo_is_ready D
# wait out the 1s cooldown
sleep 2
wo_assert "D ready again after cooldown"  wo_is_ready D
wo_group_end

wo_group_begin; wo_test "fail twice → permanently failed (max_attempts=2)"
wo_is_ready D >/dev/null 2>&1 || true   # consume the flip-to-ready
# now D is ready again; fail it a second time
wo_fail_task D "synthetic failure 2"
wo_assert_eq "D attempts after 2 fails" "2" "$(wo_status_get D .attempts)"
wo_assert_eq "D permanently failed" "failed" "$(wo_status_get D .status)"
wo_assert "D has no next_retry"  test -z "$(wo_status_get D .next_retry_at)"
# failed-permanent tasks are never ready
wo_assert_not "D NOT ready when permanently failed"  wo_is_ready D
wo_group_end

wo_group_begin; wo_test "count_status tallies correctly"
wo_assert_eq "done count"   "3" "$(wo_count_status done)"     # A,B,C
wo_assert_eq "failed count" "1" "$(wo_count_status failed)"   # D
wo_assert_eq "ready count"  "0" "$(wo_count_status ready)"    # nothing ready
wo_group_end

wo_test_summary
