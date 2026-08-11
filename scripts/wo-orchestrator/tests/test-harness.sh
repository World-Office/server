#!/usr/bin/env bash
# test-harness.sh — minimal test framework for wo-orchestrator.
# Defines: wo_test <name> (group), wo_assert <cmd...>, wo_assert_eq <a> <b>,
#           and a PASS/FAIL counter. Sourced by each test file.
WO_TESTS_RUN=0
WO_TESTS_PASS=0
WO_TESTS_FAIL=0
WO_CURRENT_GROUP=""

wo_test() {  # start a named test group
  WO_CURRENT_GROUP="$*"
  WO_TESTS_RUN=$((WO_TESTS_RUN + 1))
}

wo_pass() { printf '  \033[32mPASS\033[0m %s\n' "$WO_CURRENT_GROUP"; WO_TESTS_PASS=$((WO_TESTS_PASS + 1)); }
wo_fail() { printf '  \033[31mFAIL\033[0m %s\n    %s\n' "$WO_CURRENT_GROUP" "$*"; WO_TESTS_FAIL=$((WO_TESTS_FAIL + 1)); }

# wo_assert <description> <condition-cmd...>  — runs cmd, passes if exit 0
wo_assert() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf '    \033[32mok\033[0m   %s\n' "$desc"
  else
    printf '    \033[31mBAD\033[0m  %s\n' "$desc"
    WO_GROUP_FAILED=1
  fi
}

# wo_assert_not <description> <cmd...>  — passes if cmd exits NON-zero
wo_assert_not() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf '    \033[31mBAD\033[0m  %s (expected non-zero exit)\n' "$desc"
    WO_GROUP_FAILED=1
  else
    printf '    \033[32mok\033[0m   %s\n' "$desc"
  fi
}

# wo_assert_eq <desc> <expected> <actual>
wo_assert_eq() {
  local desc="$1" exp="$2" act="$3"
  if [[ "$exp" == "$act" ]]; then
    printf '    \033[32mok\033[0m   %s\n' "$desc"
  else
    printf '    \033[31mBAD\033[0m  %s (expected %q, got %q)\n' "$desc" "$exp" "$act"
    WO_GROUP_FAILED=1
  fi
}

# wo_group_begin / wo_group_end — wrap a test() group to count pass/fail
wo_group_begin() { WO_GROUP_FAILED=0; }
wo_group_end() {
  if [[ "$WO_GROUP_FAILED" == "0" ]]; then wo_pass; else wo_fail "$WO_CURRENT_GROUP"; fi
}

wo_test_summary() {
  local rc=0
  echo ""
  echo "──────────────────────────────────────────"
  printf 'Tests: %d run, \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n' \
    "$WO_TESTS_RUN" "$WO_TESTS_PASS" "$WO_TESTS_FAIL"
  [[ "$WO_TESTS_FAIL" -gt 0 ]] && rc=1
  return $rc
}
