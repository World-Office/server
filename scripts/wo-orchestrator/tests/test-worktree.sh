#!/usr/bin/env bash
# test-worktree.sh — git worktree create/remove/merge lifecycle, isolated.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/test-harness.sh"

SBOX="$(mktemp -d)"
trap 'rm -rf "$SBOX"' EXIT

# Isolated fake repo (NOT the real server checkout)
export WO_REPO_DIR="$SBOX/repo"
export WO_WORKTREE_ROOT="$WO_REPO_DIR/.wo-worktrees"   # inside repo (real default)
export WO_STATE_DIR="$SBOX/state"
export WO_LOG_DIR="$SBOX/logs"
export WO_BRANCH_PREFIX="agent"
mkdir -p "$WO_REPO_DIR" "$WO_WORKTREE_ROOT" "$WO_STATE_DIR" "$WO_LOG_DIR"

git -C "$WO_REPO_DIR" init -q -b main
git -C "$WO_REPO_DIR" config user.email t@t.t
git -C "$WO_REPO_DIR" config user.name test
echo "base" > "$WO_REPO_DIR/README.md"
git -C "$WO_REPO_DIR" add -A && git -C "$WO_REPO_DIR" commit -qm "init"

# Minimal config so common.sh resolves
export WO_CONFIG_DIR="$SBOX/config"; mkdir -p "$WO_CONFIG_DIR"
echo '{"workers":[{"name":"w1","provider":"p","model":"m","enabled":true}],
       "defaults":{"max_attempts":2,"retry_cooldown_s":1,"accept_timeout_s":5,"dispatch_timeout_s":30}}' \
  > "$WO_CONFIG_DIR/workers.json"
echo '{"tasks":[{"id":"T1","engine":"t","title":"T1","section":"§1","deps":[],"scope":["a.rs"],"accept":"true","manual":false}]}' \
  > "$WO_CONFIG_DIR/tasks.json"

. "$HERE/../lib/common.sh"
. "$HERE/../lib/worktree.sh"

echo "=== Worktree lifecycle tests ==="

wo_group_begin; wo_test "worktree gitignore entry is added when missing (in-repo root)"
wo_worktree_ensure_gitignore
wo_assert "worktree root is gitignored" git -C "$WO_REPO_DIR" check-ignore -q .wo-worktrees
# out-of-repo root should be a no-op (no error)
WO_WORKTREE_ROOT="$SBOX/external" wo_worktree_ensure_gitignore
wo_assert "out-of-repo root skipped cleanly" true
wo_group_end

wo_group_begin; wo_test "create worktree + branch from main"
WT="$(wo_worktree_create T1)"
wo_assert "worktree dir exists"        test -d "$WT"
wo_assert "branch exists"              git -C "$WO_REPO_DIR" rev-parse --verify --quiet agent/T1
wo_assert "worktree shares HEAD as main" git -C "$WT" rev-parse --quiet --verify HEAD
wo_assert_eq "worktree path suffix" "/T1" "${WT#$WO_WORKTREE_ROOT}"
wo_group_end

wo_group_begin; wo_test "edit + commit in worktree, then merge to main"
echo "impl" > "$WT/a.rs"
git -C "$WT" add -A && git -C "$WT" commit -qm "feat(T1): T1"
# main should not yet have a.rs
wo_assert_not "a.rs absent on main pre-merge" git -C "$WO_REPO_DIR" show main:a.rs
wo_assert "merge succeeds (ff)"        wo_worktree_merge T1
wo_assert "a.rs present on main post-merge" git -C "$WO_REPO_DIR" show main:a.rs >/dev/null
wo_group_end

wo_group_begin; wo_test "remove worktree + delete branch"
wo_worktree_remove T1
wo_assert_not "worktree dir gone"      test -d "$WT"
wo_worktree_delete_branch T1
wo_assert_not "branch deleted"         git -C "$WO_REPO_DIR" rev-parse --verify --quiet agent/T1
wo_group_end

wo_group_begin; wo_test "re-create worktree on existing branch (retry path)"
# Simulate a prior failed attempt leaving a branch
git -C "$WO_REPO_DIR" worktree add -q -b agent/T2 "$WO_WORKTREE_ROOT/T2" main
echo "v1" > "$WO_WORKTREE_ROOT/T2/a.rs"
git -C "$WO_WORKTREE_ROOT/T2" add -A && git -C "$WO_WORKTREE_ROOT/T2" commit -qm "attempt1"
wo_worktree_remove T2
# now branch exists but worktree doesn't — create should re-add on existing branch
WT2="$(wo_worktree_create T2)"
wo_assert "worktree re-created on existing branch" test -d "$WT2"
wo_assert_eq "prior commit preserved" "v1" "$(cat "$WT2/a.rs")"
wo_worktree_remove T2
wo_group_end

wo_test_summary
