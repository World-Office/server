#!/usr/bin/env bash
# test-harness.sh — unified test orchestrator for the World-Office docserver
#
# One entry point over the LIVE stack (Python/FastAPI docserver). Every
# command is a real gate that CI also runs — no fiction, no stubs.
#
# Commands:
#   unit                full pytest suite (opencloud-docserver/tests)
#   gates               harness-graph drift + register coverage gates
#   select [--base R]   impact analysis: e2e tests affected by the diff
#   affected [--base R] e2e + unit tests affected by the diff
#   feature F-xxx       tests covering one register feature
#   e2e                 e2e suite (requires a live stack; skipped honestly)
#                       --only wopi|gui selects the protocol/browser half
#   coverage            unit suite + coverage gate (fail_under in pyproject)
#   mutation [MODULE]   mutation testing (slow; surviving mutants = gaps)
#   all                 unit + gates   (e2e only when E2E_BASE is set)
#
# Flags:
#   --fast              unit: stop at first failure (-x)
#   --json PATH         write a machine-readable run report
#   --list              select: one test per line
#   --self-test         validate the harness itself (used by CI)
#
# Exit codes: 0 pass, 1 failure, 2 environment/setup error.
#
# License: AGPL-3.0-or-later. Part of World-Office.

set -uo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(realpath "$HARNESS_DIR/../..")"
DOCSERVER_DIR="$REPO_DIR/opencloud-docserver"
GRAPH_DIR="$REPO_DIR/scripts/harness-graph"
STATE_DIR="${TF_STATE_DIR:-$HARNESS_DIR/state}"
PYTHON="${PYTHON:-python3}"

RED='' GREEN='' YELLOW='' BLUE='' NC=''
if [[ -t 1 ]]; then
  RED=$'\033[0;31m' GREEN=$'\033[0;32m' YELLOW=$'\033[1;33m' BLUE=$'\033[0;34m' NC=$'\033[0m'
fi

ok()   { printf '%s[ok]%s %s\n'   "$GREEN" "$NC" "$1"; }
fail() { printf '%s[FAIL]%s %s\n' "$RED"   "$NC" "$1"; }
info() { printf '%s[..]%s %s\n'   "$BLUE"  "$NC" "$1"; }
note() { printf '%s[--]%s %s\n'   "$YELLOW" "$NC" "$1"; }

FAST=0; JSON_OUT=""; SEL_BASE=""; SEL_LIST=0
declare -A RESULT_MAP=()

die() { fail "$1"; exit 2; }

need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }

require_tree() {
  [[ -f "$GRAPH_DIR/seed.py" ]]      || die "harness-graph missing at $GRAPH_DIR"
  [[ -f "$DOCSERVER_DIR/pyproject.toml" ]] || die "docserver missing at $DOCSERVER_DIR"
  need "$PYTHON"; need uv
}

# ---------------------------------------------------------------------------
# commands

cmd_affected() {
  info "tests affected by diff (${SEL_BASE:-working tree vs HEAD})"
  local -a sargs=()
  [[ -n "$SEL_BASE" ]] && sargs+=(--base "$SEL_BASE")
  [[ $SEL_LIST -eq 1 ]] && sargs+=(--list)
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/select-tests.py --unit --list ${sargs[@]+"${sargs[@]}"} )
  local rc=$?
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/select-tests.py ${sargs[@]+"${sargs[@]}"} )
  return $rc
}

cmd_unit() {
  info "unit suite (opencloud-docserver/tests, parallel${FAST:+, fail-fast})"
  local -a args=(run --frozen pytest tests/ -q -n "${WO_UNIT_WORKERS:-auto}" --dist loadgroup)
  [[ $FAST -eq 1 ]] && args+=(-x)
  [[ "${WO_UNIT_WORKERS:-}" == "0" ]] && args=(run --frozen pytest tests/ -q)
  ( cd "$DOCSERVER_DIR" && uv ${args[@]+"${args[@]}"} )
  local rc=$?
  RESULT_MAP[unit]=$(( rc == 0 ? 1 : 0 ))
  (( rc == 0 )) && ok "unit suite passed" || fail "unit suite failed (rc=$rc)"
  return $rc
}

_register_ids() {
  grep -oE 'F-[0-9]{3}' "$GRAPH_DIR/features.yaml" | sort -u | tr '\n' ' '
}

cmd_gates() {
  info "gate 1/2: harness-graph drift"
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/seed.py --check )
  local rc=$?
  if (( rc == 0 )); then ok "graph.json in sync"; else fail "graph.json is stale"; return 1; fi

  info "gate 2/2: register full resolution"
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/check-register.py $(_register_ids) )
  local rc2=$?
  RESULT_MAP[gates]=$(( rc2 == 0 ? 1 : 0 ))
  (( rc2 == 0 )) && ok "register gates passed" || fail "register gates failed"
  return $rc2
}

cmd_select() {
  info "impact analysis (diff = ${SEL_BASE:-working tree vs HEAD})"
  local args=()
  [[ -n "$SEL_BASE" ]] && args+=(--base "$SEL_BASE")
  [[ $SEL_LIST -eq 1 ]] && args+=(--list)
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/select-tests.py ${args[@]+"${args[@]}"} )
}

cmd_feature() {
  [[ "${1:-}" =~ ^F-[0-9]{3}$ ]] || die "usage: test-harness.sh feature F-xxx"
  info "tests covering $1 (from graph.json COVERS edges)"
  "$PYTHON" - "$GRAPH_DIR/graph.json" "$1" << 'PYEOF'
import json, sys
g = json.load(open(sys.argv[1]))
feat = sys.argv[2]
known = {n["id"] for n in g["nodes"]}
if feat not in known:
    print(f"error: {feat} not in graph", file=sys.stderr); sys.exit(2)
tests = sorted(e["from"] for e in g["edges"] if e["type"] == "COVERS" and e["to"] == feat)
if not tests:
    print(f"error: {feat} has no covering tests", file=sys.stderr); sys.exit(1)
print("\n".join(tests))
PYEOF
}

cmd_e2e() {
  local only="${E2E_ONLY:-}"
  if [[ -z "${E2E_BASE:-}" ]]; then
    note "e2e skipped: E2E_BASE not set (no live stack configured)"
    RESULT_MAP[e2e]="skipped"
    return 0
  fi
  local -a sel=()
  case "$only" in
    wopi) sel+=(-m wopi); info "e2e protocol suite (-m wopi) against $E2E_BASE" ;;
    gui)  sel+=(-m gui);  info "e2e browser suite (-m gui) against $E2E_BASE" ;;
    *)    info "e2e suite (gui + wopi) against $E2E_BASE" ;;
  esac
  ( cd "$DOCSERVER_DIR/e2e" && uv run --frozen pytest -q ${sel[@]+"${sel[@]}"} )
  local rc=$?
  RESULT_MAP[e2e]=$(( rc == 0 ? 1 : 0 ))
  (( rc == 0 )) && ok "e2e passed" || fail "e2e failed"
  return $rc
}

cmd_coverage() {
  info "coverage gate (fail_under from pyproject.toml)"
  local -a args=(run --frozen pytest tests/ -q -n "${WO_UNIT_WORKERS:-auto}" --dist loadgroup
                 --cov=src --cov-report=term-missing:skip-covered)
  [[ $FAST -eq 1 ]] && args+=(-x)
  ( cd "$DOCSERVER_DIR" && uv ${args[@]+"${args[@]}"} )
  local rc=$?
  RESULT_MAP[coverage]=$(( rc == 0 ? 1 : 0 ))
  (( rc == 0 )) && ok "coverage gate passed" || fail "coverage gate failed (rc=$rc)"
  return $rc
}

cmd_mutation() {
  local module="${1:-}"
  local -a args=(run --frozen python scripts/mutation-test.py)
  [[ -n "$module" ]] && args+=(--module "$module")
  info "mutation testing${module:+ ($module)} — slow by design (surviving mutants = coverage gaps)"
  ( cd "$DOCSERVER_DIR" && uv ${args[@]+"${args[@]}"} )
  local rc=$?
  RESULT_MAP[mutation]=$(( rc == 0 ? 1 : 0 ))
  (( rc == 0 )) && ok "mutation gate passed" || fail "mutation gate failed (surviving mutants)"
  return $rc
}

cmd_self_test() {
  info "self-test: harness environment"
  require_tree
  ok "tree layout + toolchain"

  info "self-test: graph is not stale"
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/seed.py --check >/dev/null ) \
    || die "graph.json stale — run seed.py"
  ok "graph drift gate"

  info "self-test: pytest collects"
  local n
  n=$( cd "$DOCSERVER_DIR" && uv run --frozen pytest --collect-only -q 2>/dev/null | tail -1 )
  echo "$n" | grep -qE '^[0-9]+ tests? collected' || die "pytest collection failed"
  ok "pytest collects ($n)"

  info "self-test: coverage + mutation tooling present"
  ( cd "$DOCSERVER_DIR" && uv run --frozen python -c "import pytest_cov" ) \
    || die "pytest-cov missing (coverage gate would crash)"
  /usr/bin/python3 -m py_compile "$DOCSERVER_DIR/scripts/mutation-test.py" \
    || die "mutation-test.py has a syntax error"
  ok "coverage + mutation tooling"

  info "self-test: register resolves"
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/check-register.py $(_register_ids) >/dev/null ) \
    || die "register has unresolved features"
  ok "register gate"

  info "self-test: select-tests answers"
  ( cd "$REPO_DIR" && "$PYTHON" scripts/harness-graph/select-tests.py --base HEAD~1 >/dev/null ) \
    || die "select-tests failed"
  ok "impact analysis"

  ok "self-test PASSED"
}

# ---------------------------------------------------------------------------
# dispatch

main() {
  local cmd="all"
  local -a rest=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fast)  FAST=1 ;;
      --json)  JSON_OUT="${2:?}"; shift ;;
      --base)  SEL_BASE="${2:?}"; shift ;;
      --list)  SEL_LIST=1 ;;
      --serial) WO_UNIT_WORKERS=0 ;;
      --only)  export E2E_ONLY="${2:?}" ;;
      --self-test) cmd="self-test" ;;
      help|-h) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
      unit|gates|select|affected|feature|e2e|coverage|mutation|all) cmd="$1" ;;
      -*) die "unknown flag: $1" ;;
      *) rest+=("$1") ;;  # e.g. feature's F-xxx
    esac
    shift
  done

  mkdir -p "$STATE_DIR"
  local t0 rc=0
  t0=$(date +%s)
  case "$cmd" in
    unit)      require_tree; cmd_unit; rc=$? ;;
    gates)     require_tree; cmd_gates; rc=$? ;;
    select)    require_tree; cmd_select; rc=$? ;;
    affected)  require_tree; cmd_affected; rc=$? ;;
    feature)   require_tree; cmd_feature "${rest[@]:-}"; rc=$? ;;
    e2e)       require_tree; cmd_e2e; rc=$? ;;
    coverage)  require_tree; cmd_coverage; rc=$? ;;
    mutation)  require_tree; cmd_mutation "${rest[@]:-}"; rc=$? ;;
    all)       require_tree
               cmd_unit; rc=$?
               cmd_gates || rc=$?
               cmd_e2e || rc=$? ;;
    self-test) cmd_self_test; rc=$? ;;
    help|-h)   sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)         die "unknown command: $cmd (try: unit|gates|select|affected|feature|e2e|coverage|mutation|all|self-test)" ;;
  esac

  if [[ -n "$JSON_OUT" ]]; then
    local dt=$(( $(date +%s) - t0 ))
    local -a parts=()
    for k in unit gates e2e; do
      [[ -n "${RESULT_MAP[$k]:-}" ]] && parts+=("\"$k\": ${RESULT_MAP[$k]}")
    done
    local joined
    joined=$(IFS=,; echo "${parts[*]}")
    printf '{%s, "seconds": %d}\n' "$joined" "$dt" > "$JSON_OUT"
    note "report written: $JSON_OUT"
  fi
  exit $rc
}

main "$@"
