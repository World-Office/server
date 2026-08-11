#!/usr/bin/env bash
# test-verify.sh — acceptance-gate runner: PASS, FAIL, TIMEOUT, scope-drift.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/test-harness.sh"

SBOX="$(mktemp -d)"
trap 'rm -rf "$SBOX"' EXIT
export WO_REPO_DIR="$SBOX/repo"; export WO_WORKTREE_ROOT="$WO_REPO_DIR/.wo-worktrees"
export WO_STATE_DIR="$SBOX/state"; export WO_LOG_DIR="$SBOX/logs"
export WO_BRANCH_PREFIX="agent"
mkdir -p "$WO_REPO_DIR/.wo-worktrees" "$WO_STATE_DIR" "$WO_LOG_DIR"
git -C "$WO_REPO_DIR" init -q -b main
git -C "$WO_REPO_DIR" config user.email t@t.t; git -C "$WO_REPO_DIR" config user.name test
echo base > "$WO_REPO_DIR/README.md"
git -C "$WO_REPO_DIR" add -A && git -C "$WO_REPO_DIR" commit -qm init

export WO_CONFIG_DIR="$SBOX/config"; mkdir -p "$WO_CONFIG_DIR"
echo '{"workers":[{"name":"w1","provider":"p","model":"m","enabled":true}],
       "defaults":{"max_attempts":2,"retry_cooldown_s":1,"accept_timeout_s":3}}' \
  > "$WO_CONFIG_DIR/workers.json"
# three tasks: passing, failing, slow (timeout)
cat > "$WO_CONFIG_DIR/tasks.json" <<'JSON'
{"_meta":{"task_count":3},"tasks":[
{"id":"PASS","engine":"t","title":"passes","section":"§1","deps":[],"scope":["a.rs"],"accept":"test -f marker","manual":false},
{"id":"FAIL","engine":"t","title":"fails","section":"§1","deps":[],"scope":["b.rs"],"accept":"false","manual":false},
{"id":"SLOW","engine":"t","title":"slow","section":"§1","deps":[],"scope":["c.rs"],"accept":"sleep 10","manual":false},
{"id":"NOSCOPE","engine":"t","title":"no-accept","section":"§1","deps":[],"scope":["d.rs"],"accept":"","manual":false}
]}
JSON

. "$HERE/../lib/common.sh"
. "$HERE/../lib/status.sh"
. "$HERE/../lib/worktree.sh"
. "$HERE/../lib/verify.sh"

echo "=== Verify / acceptance-gate tests ==="

wo_group_begin; wo_test "PASS: accept command exits 0 → verdict PASS"
WT="$(wo_worktree_create PASS)"
touch "$WT/marker"   # so `test -f marker` succeeds
v="$(wo_verify PASS "$WT")"
wo_assert_eq "verdict" "PASS" "$v"
wo_worktree_remove PASS
wo_group_end

wo_group_begin; wo_test "FAIL: accept command exits non-zero → verdict FAIL"
WT="$(wo_worktree_create FAIL)"
v="$(wo_verify FAIL "$WT")" || true
wo_assert "fail verdict starts with 'FAIL: exit '" test "${v#FAIL: exit }" != "$v"
wo_worktree_remove FAIL
wo_group_end

wo_group_begin; wo_test "TIMEOUT: accept command exceeds accept_timeout_s → verdict FAIL timeout"
WT="$(wo_worktree_create SLOW)"
v="$(wo_verify SLOW "$WT")" || true
wo_assert_eq "timeout verdict" "FAIL: timeout after 3s" "$v"
wo_worktree_remove SLOW
wo_group_end

wo_group_begin; wo_test "SKIP: empty accept command → manual sign-off (SKIP, exit 0)"
WT="$(wo_worktree_create NOSCOPE)"
v="$(wo_verify NOSCOPE "$WT")"
wo_assert_eq "verdict" "SKIP: no accept command (manual task)" "$v"
wo_worktree_remove NOSCOPE
wo_group_end

wo_group_begin; wo_test "scope-drift check flags out-of-scope edits (advisory)"
# Re-scope PASS task to only allow a.rs, then commit an edit to z.rs in its branch
cat > "$WO_CONFIG_DIR/tasks.json" <<'JSON'
{"_meta":{"task_count":1},"tasks":[
{"id":"PASS","engine":"t","title":"passes","section":"§1","deps":[],"scope":["a.rs"],"accept":"true","manual":false}]}
JSON
WT="$(wo_worktree_create PASS)"
echo impl > "$WT/a.rs"; echo drift > "$WT/z.rs"
git -C "$WT" add -A && git -C "$WT" commit -qm "edits"
drift="$(wo_verify_scope PASS "$WT")"
wo_assert_eq "z.rs flagged as out-of-scope" "z.rs" "$drift"
wo_worktree_remove PASS
wo_group_end

wo_test_summary
