#!/usr/bin/env bash
# test-dispatch.sh — prompt rendering + dry-run dispatch (no pi invocation).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/test-harness.sh"

# Isolated sandbox; reuse REAL tasks.json/workers.json for fidelity
SBOX="$(mktemp -d)"
trap 'rm -rf "$SBOX"' EXIT
export WO_CONFIG_DIR="$SBOX/config"; mkdir -p "$WO_CONFIG_DIR"
cp "$HERE/../config/tasks.json" "$WO_CONFIG_DIR/tasks.json"
cp "$HERE/../config/workers.json" "$WO_CONFIG_DIR/workers.json"
export WO_STATE_DIR="$SBOX/state"; export WO_LOG_DIR="$SBOX/logs"
export WO_REPO_DIR="$SBOX/repo"; mkdir -p "$WO_REPO_DIR"
git -C "$WO_REPO_DIR" init -q -b main >/dev/null 2>&1
git -C "$WO_REPO_DIR" config user.email t@t.t; git -C "$WO_REPO_DIR" config user.name test
echo base > "$WO_REPO_DIR/README.md"; git -C "$WO_REPO_DIR" add -A; git -C "$WO_REPO_DIR" commit -qm init

. "$HERE/../lib/common.sh"
. "$HERE/../lib/status.sh"
. "$HERE/../lib/worktree.sh"
. "$HERE/../lib/verify.sh"
. "$HERE/../lib/dispatch.sh"

echo "=== Dispatch / prompt-render tests ==="

wo_group_begin; wo_test "wo_render_prompt fills all placeholders for FC-1"
prompt="$(wo_render_prompt FC-1)"
wo_assert "contains task id FC-1"     grep -q "FC-1" <<< "$prompt"
wo_assert "contains title (Path)"     grep -q "Path" <<< "$prompt"
wo_assert "contains engine foundation" grep -q "foundation" <<< "$prompt"
wo_assert "contains scope file path.rs" grep -q "path.rs" <<< "$prompt"
wo_assert "contains accept command"   grep -q "cargo test -p wo-common path::" <<< "$prompt"
wo_assert "contains commit message"   grep -q "feat(FC-1)" <<< "$prompt"
# no unfilled placeholders left
wo_assert_not "no unfilled {{ }} placeholders" grep -q "{{" <<< "$prompt"
wo_group_end

wo_group_begin; wo_test "wo_render_prompt for a multi-dep task (DM-9)"
prompt="$(wo_render_prompt DM-9)"
wo_assert "contains DM-9 id"          grep -q "DM-9" <<< "$prompt"
wo_assert "contains editable_model scope" grep -q "model.rs" <<< "$prompt"
wo_assert_not "no unfilled placeholders" grep -q "{{" <<< "$prompt"
wo_group_end

wo_group_begin; wo_test "wo_dispatch_one_dryrun prints plan without running pi"
out="$(wo_dispatch_one_dryrun DM-3 zai 2>/dev/null)"
wo_assert "names worker zai"          grep -q "worker=zai" <<< "$out"
wo_assert "names provider"            grep -q "zai/" <<< "$out"
wo_assert "shows accept command"      grep -q "cargo test -p wo-ooxml-ops" <<< "$out"
wo_group_end

wo_group_begin; wo_test "worker lookup resolves enabled workers only"
names="$(wo_worker_names)"
enabled_n="$(jq '[.workers[]|select(.enabled)]|length' "$WORKERS_JSON")"
wo_assert_eq "enabled worker count" "$enabled_n" "$(echo "$names" | wc -l)"
wo_assert "zai present"    grep -qxF zai <<< "$names"
wo_assert "local-flash present" grep -qxF local-flash <<< "$names"
# disabled worker would be filtered
wo_assert_eq "zai model" "glm-5-turbo" "$(wo_worker_field zai .model)"
wo_assert_eq "zai endpoint" "https://api.z.ai/api/coding/paas/v4" "$(wo_worker_field zai .endpoint)"
wo_group_end

wo_test_summary
