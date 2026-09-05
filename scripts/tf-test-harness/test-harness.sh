#!/usr/bin/env bash
# test-harness.sh — TaskFleet-based unified test orchestrator for World-Office
#
# Part of the TaskFleet test harness improvement project (TH-001)
#
# This script orchestrates all World-Office tests using TaskFleet infrastructure:
#   - Rust unit tests
#   - E2E integration tests  
#   - Conformance tests
#   - Mutation tests
#   - Visual regression tests
#   - And more...
#
# Usage:
#   test-harness.sh                    # Run all tests
#   test-harness.sh --status           # Show test board
#   test-harness.sh --category rust    # Run only Rust tests
#   test-harness.sh --fast             # Run only fast tests
#   test-harness.sh --affected         # Run tests affected by changes
#   test-harness.sh --self-test        # Validate harness
#
# See README.md for complete documentation
#
# Author: World-Office Team
# License: AGPL-3.0-or-later

set -uo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

TF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_REPO_DIR="${TF_REPO_DIR:-$(realpath "$TF_DIR/../..")}"
TF_CONFIG_DIR="${TF_CONFIG_DIR:-$TF_DIR/config}"
TF_STATE_DIR="${TF_STATE_DIR:-$TF_DIR/state}"
TF_WORKTREE_ROOT="${TF_WORKTREE_ROOT:-$TF_DIR/.tf-worktrees}"
TF_MAX_PARALLEL="${TF_MAX_PARALLEL:=$(nproc)}"
TF_POLL_SECONDS="${TF_POLL_SECONDS:-5}"
TF_TIMEOUT_MINUTES="${TF_TIMEOUT_MINUTES:-30}"
TF_CONTINUE_ON_FAILURE="${TF_CONTINUE_ON_FAILURE:-1}"
TF_CLEANUP_WORKTREES="${TF_CLEANUP_WORKTREES:-1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Libraries
# -----------------------------------------------------------------------------

# Load TaskFleet libraries
for lib_file in "$TF_DIR/../wo-orchestrator/lib/"*.sh; do
  if [[ -f "$lib_file" ]]; then
    # shellcheck source=../wo-orchestrator/lib/*.sh
    . "$lib_file"
  fi
done

# Load test harness specific libraries
for lib_file in "$TF_DIR/lib/"*.sh; do
  if [[ -f "$lib_file" ]]; then
    # shellcheck source=lib/*.sh
    . "$lib_file"
  fi
done

# -----------------------------------------------------------------------------
# Ensure directories exist
# -----------------------------------------------------------------------------

mkdir -p "$TF_WORKTREE_ROOT" "$TF_STATE_DIR" "$TF_CONFIG_DIR"

# -----------------------------------------------------------------------------
# Functions
# -----------------------------------------------------------------------------

# Print colored header
tf_header() {
  echo -e "${BLUE}=== $1 ===${NC}"
}

# Print colored info
tf_info() {
  echo -e "${CYAN}[INFO]${NC} $1"
}

# Print colored success
tf_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
}

# Print colored warning
tf_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

# Print colored error
tf_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Print debug (only if DEBUG=1)
tf_debug() {
  if [[ "${DEBUG:-0}" == "1" ]]; then
    echo -e "${BLUE}[DEBUG]${NC} $1" >&2
  fi
}

# -----------------------------------------------------------------------------
# Argument parsing
# -----------------------------------------------------------------------------

MODE="run"
CATEGORIES=()
FAST_ONLY=0
AFFECTED_ONLY=0
BASE_BRANCH=""
SPECIFIC_TASKS=()
FEATURES=()
RETRIES=0
DEBUG=0
SELF_TEST=0
CHECK_DEPS=0
INSTALL_DEPS=0
CHECK_HARNESS_GRAPH=0
CLEANUP=0
GENERATE_TESTS=0
VALIDATE_TESTS=0
REPORT_FORMAT=""
REPORT_OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status) MODE="status"; shift ;;
    --once) MODE="once"; shift ;;
    --dry-run) MODE="dry-run"; shift ;;
    --category) CATEGORIES+=("$2"); shift 2 ;;
    --fast) FAST_ONLY=1; shift ;;
    --affected) AFFECTED_ONLY=1; BASE_BRANCH="${2:-HEAD}"; shift ;;
    --since|--base) BASE_BRANCH="$2"; shift 2 ;;
    --task) SPECIFIC_TASKS+=("$2"); shift 2 ;;
    --feature) FEATURES+=("$2"); shift 2 ;;
    --retry) RETRIES="${2:-3}"; shift ;; 
    --debug) DEBUG=1; shift ;;
    --self-test) SELF_TEST=1; shift ;;
    --check-deps) CHECK_DEPS=1; shift ;;
    --install-deps) INSTALL_DEPS=1; shift ;;
    --check-harness-graph) CHECK_HARNESS_GRAPH=1; shift ;;
    --cleanup) CLEANUP=1; shift ;;
    --generate-tests) GENERATE_TESTS=1; shift ;;
    --validate-tests) VALIDATE_TESTS=1; shift ;;
    --report-html) REPORT_FORMAT="html"; REPORT_OUTPUT="${2:-report.html}"; shift ;;
    --report-md) REPORT_FORMAT="md"; REPORT_OUTPUT="${2:-REPORT.md}"; shift ;;
    --report-json) REPORT_FORMAT="json"; REPORT_OUTPUT="${2:-results.json}"; shift ;;
    --help|-h)
      echo "Usage: $(basename "$0") [OPTIONS]"
      echo ""
      echo "TaskFleet-based unified test orchestrator for World-Office"
      echo ""
      echo "Options:"
      echo "  --status              Show test board and exit"
      echo "  --once                Run one dispatch round, then exit"
      echo "  --dry-run             Show dispatch plan without running"
      echo "  --category CATEGORY   Run only tests in category"
      echo "  --fast                Run only fast tests (< 30s)"
      echo "  --affected [BASE]     Run tests affected by changes"
      echo "  --task TASK_ID        Run specific test(s)"
      echo "  --feature FEATURE     Run tests for harness graph feature"
      echo "  --retry N             Retry failed tests N times"
      echo "  --debug               Show verbose debug output"
      echo "  --self-test           Validate harness configuration"
      echo "  --check-deps          Check for missing dependencies"
      echo "  --install-deps        Install missing dependencies"
      echo "  --check-harness-graph Verify harness graph is up to date"
      echo "  --cleanup             Clean up worktrees and state"
      echo "  --generate-tests      Generate test tasks from source"
      echo "  --validate-tests      Validate test task definitions"
      echo "  --report-html FILE    Generate HTML report"
      echo "  --report-md FILE      Generate Markdown report"
      echo "  --report-json FILE    Generate JSON report"
      echo "  --help, -h            Show this help"
      echo ""
      echo "Environment:"
      echo "  TF_REPO_DIR          Repository root"
      echo "  TF_CONFIG_DIR        Config directory"
      echo "  TF_STATE_DIR         State directory"
      echo "  TF_WORKTREE_ROOT     Worktree directory"
      echo "  TF_MAX_PARALLEL      Max concurrent tasks"
      echo ""
      echo "See README.md for complete documentation"
      exit 0
      ;;
    *)
      if [[ "$1" == --* ]]; then
        tf_error "Unknown option: $1"
        exit 2
      fi
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Self-test
# -----------------------------------------------------------------------------

if [[ $SELF_TEST -eq 1 ]]; then
  tf_header "Running self-tests..."
  
  # Check that required files exist
  errors=0
  
  for file in test-harness.sh README.md lib/*.sh config/*.json scripts/*.py; do
    if ! [[ -e "$TF_DIR/$file" || -e "$TF_DIR/config/$(basename "$file")" ]]; then
      tf_error "Missing file: $file"
      errors=$((errors + 1))
    fi
  done
  
  if [[ $errors -gt 0 ]]; then
    tf_error "Self-test failed: $errors missing files"
    exit 1
  else
    tf_success "Self-test passed: All required files exist"
    exit 0
  fi
fi

# -----------------------------------------------------------------------------
# Special modes
# -----------------------------------------------------------------------------

if [[ $CHECK_DEPS -eq 1 ]]; then
  tf_header "Checking dependencies..."
  deps_ok=1
  
  for dep in git jq flock pi cargo rustc node pnpm python3; do
    if ! command -v $dep &>/dev/null; then
      tf_error "Missing dependency: $dep"
      deps_ok=0
    else
      tf_info "Found: $dep"
    fi
  done
  
  exit $((1 - deps_ok))
fi

if [[ $INSTALL_DEPS -eq 1 ]]; then
  # This is a placeholder - actual installation depends on the system
  tf_header "Installing dependencies..."
  tf_warn "Automatic dependency installation not implemented. Please install manually:"
  tf_warn "  - git, jq, flock, bash 4+"
  tf_warn "  - cargo, rustc (via rustup)"
  tf_warn "  - nodejs 20+, pnpm"
  tf_warn "  - python3 3.8+"
  tf_warn "  - pi coding agent"
  exit 0
fi

if [[ $CHECK_HARNESS_GRAPH -eq 1 ]]; then
  tf_header "Checking harness graph..."
  if [[ -f "$TF_REPO_DIR/scripts/harness-graph/seed.py" ]]; then
    python3 "$TF_REPO_DIR/scripts/harness-graph/seed.py" --check
    exit $?
  else
    tf_error "Harness graph not found: $TF_REPO_DIR/scripts/harness-graph/seed.py"
    exit 1
  fi
fi

if [[ $CLEANUP -eq 1 ]]; then
  tf_header "Cleaning up..."
  
  # Remove worktrees
  if [[ -d "$TF_WORKTREE_ROOT" ]]; then
    tf_info "Removing worktrees..."
    rm -rf "$TF_WORKTREE_ROOT"
  fi
  
  # Remove state
  if [[ -d "$TF_STATE_DIR" ]]; then
    tf_info "Removing state..."
    rm -rf "$TF_STATE_DIR"
  fi
  
  tf_success "Cleanup complete"
  exit 0
fi

if [[ $GENERATE_TESTS -eq 1 ]]; then
  tf_header "Generating test tasks from source..."
  python3 "$TF_DIR/scripts/generate-tests.py" --output "$TF_CONFIG_DIR/tasks.json"
  exit $?
fi

if [[ $VALIDATE_TESTS -eq 1 ]]; then
  tf_header "Validating test tasks..."
  python3 "$TF_DIR/scripts/generate-tests.py" --check --tasks "$TF_CONFIG_DIR/tasks.json"
  exit $?
fi

# -----------------------------------------------------------------------------
# Ensure tasks.json exists
# -----------------------------------------------------------------------------

TASKS_FILE="$TF_CONFIG_DIR/tasks.json"
if [[ ! -f "$TASKS_FILE" ]]; then
  tf_info "Generating test tasks (none found)..."
  python3 "$TF_DIR/scripts/generate-tests.py" --output "$TASKS_FILE"
  if [[ ! -f "$TASKS_FILE" ]]; then
    tf_error "Could not generate tasks. Run with --generate-tests manually."
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# Load tasks
# -----------------------------------------------------------------------------

tf_info "Loading tasks from $TASKS_FILE..."
ALL_TASK_IDS=$(jq -r '.tasks | keys | .[]' "$TASKS_FILE" 2>/dev/null || echo "")

if [[ -z "$ALL_TASK_IDS" ]]; then
  tf_error "No tasks found in $TASKS_FILE. Run with --generate-tests first."
  exit 1
fi

TOTAL_TASKS=$(echo "$ALL_TASK_IDS" | wc -w)
tf_info "Loaded $TOTAL_TASKS tasks"

# -----------------------------------------------------------------------------
# Filter tasks
# -----------------------------------------------------------------------------

FILTERED_TASKS=($ALL_TASK_IDS)

# Filter by category
if [[ ${#CATEGORIES[@]} -gt 0 ]]; then
  FILTERED_TASKS=()
  for cat in "${CATEGORIES[@]}"; do
    for task_id in $ALL_TASK_IDS; do
      task_cat=$(jq -r --arg task "$task_id" '.tasks[$task].category // ""' "$TASKS_FILE")
      if [[ "$task_cat" == "$cat" || "$task_cat" == ${cat}* ]]; then
        FILTERED_TASKS+=("$task_id")
      fi
    done
  done
fi

# Filter by specific tasks
if [[ ${#SPECIFIC_TASKS[@]} -gt 0 ]]; then
  FILTERED_TASKS=()
  for task_id in "${SPECIFIC_TASKS[@]}"; do
    if echo "$ALL_TASK_IDS" | grep -q "^$task_id$"; then
      FILTERED_TASKS+=("$task_id")
    else
      tf_warn "Task not found: $task_id"
    fi
  done
fi

# Filter by features (harness graph)
if [[ ${#FEATURES[@]} -gt 0 ]]; then
  NEW_FILTERED=()
  for task_id in "${FILTERED_TASKS[@]}"; do
    for feat in "${FEATURES[@]}"; do
      task_features=$(jq -r --arg task "$task_id" '.tasks[$task].features // [] | join(" ")' "$TASKS_FILE")
      if echo "$task_features" | grep -q "$feat"; then
        NEW_FILTERED+=("$task_id")
        break
      fi
    done
  done
  FILTERED_TASKS=("${NEW_FILTERED[@]}")
fi

# Filter by affected files
if [[ $AFFECTED_ONLY -eq 1 || -n "$BASE_BRANCH" ]]; then
  if [[ -z "$BASE_BRANCH" ]]; then
    BASE_BRANCH="HEAD"
  fi
  
  # Get changed files
  CHANGED_FILES=""
  if [[ "$BASE_BRANCH" == "HEAD" ]]; then
    CHANGED_FILES=$(cd "$TF_REPO_DIR" && git diff --name-only 2>/dev/null || echo "")
  elif [[ "$BASE_BRANCH" =~ ^HEAD~[0-9]+$ ]]; then
    CHANGED_FILES=$(cd "$TF_REPO_DIR" && git diff --name-only "$BASE_BRANCH" 2>/dev/null || echo "")
  else
    CHANGED_FILES=$(cd "$TF_REPO_DIR" && git diff --name-only "$BASE_BRANCH...HEAD" 2>/dev/null || echo "")
  fi
  
  if [[ -z "$CHANGED_FILES" ]]; then
    CHANGED_FILES=$(cd "$TF_REPO_DIR" && git status --porcelain | awk '{print $2}' | grep -v '^\.wo-worktrees' | grep -v '^\.tf-worktrees' || echo "")
  fi
  
  if [[ -n "$CHANGED_FILES" ]]; then
    NEW_FILTERED=()
    for task_id in "${FILTERED_TASKS[@]}"; do
      task_scope=$(jq -r --arg task "$task_id" '.tasks[$task].scope // [] | join(" ")' "$TASKS_FILE")
      if [[ -n "$task_scope" ]]; then
        for changed in $CHANGED_FILES; do
          if echo "$task_scope" | grep -q "$changed"; then
            NEW_FILTERED+=("$task_id")
            break
          fi
        done
      else
        # No scope means include all
        NEW_FILTERED+=("$task_id")
      fi
    done
    FILTERED_TASKS=("${NEW_FILTERED[@]}")
  fi
fi

# Filter by speed
if [[ $FAST_ONLY -eq 1 ]]; then
  NEW_FILTERED=()
  for task_id in "${FILTERED_TASKS[@]}"; do
    task_fast=$(jq -r --arg task "$task_id" '.tasks[$task].fast // false' "$TASKS_FILE")
    if [[ "$task_fast" == "true" ]]; then
      NEW_FILTERED+=("$task_id")
    fi
  done
  FILTERED_TASKS=("${NEW_FILTERED[@]}")
fi

# Remove duplicates and sort by priority
FILTERED_TASKS=($(printf "%s\n" "${FILTERED_TASKS[@]}" | sort -u | {
  while IFS= read -r task_id; do
    priority=$(jq -r --arg task "$task_id" '.tasks[$task].priority // 999' "$TASKS_FILE")
    echo "$priority $task_id"
  done
  sort -n | awk '{print $2}'
}))

TASK_COUNT=${#FILTERED_TASKS[@]}
tf_info "Filtered to $TASK_COUNT tasks"

if [[ $TASK_COUNT -eq 0 ]]; then
  tf_info "No tasks match the filters."
  exit 0
fi

# -----------------------------------------------------------------------------
# Status mode
# -----------------------------------------------------------------------------

if [[ "$MODE" == "status" ]]; then
  tf_header "Test Board"
  echo ""
  echo "Total tasks: $TASK_COUNT"
  echo "Tasks file: $TASKS_FILE"
  echo ""
  echo "Tasks:"
  for task_id in "${FILTERED_TASKS[@]}"; do
    task_name=$(jq -r --arg task "$task_id" '.tasks[$task].name' "$TASKS_FILE")
    task_cat=$(jq -r --arg task "$task_id" '.tasks[$task].category' "$TASKS_FILE")
    task_fast=$(jq -r --arg task "$task_id" '.tasks[$task].fast // false' "$TASKS_FILE")
    fast_marker=""
    [[ "$task_fast" == "true" ]] && fast_marker=" (fast)"
    printf "  %-10s %-40s [%s]%s\n" "$task_id" "$task_name" "$task_cat" "$fast_marker"
  done
  exit 0
fi

# -----------------------------------------------------------------------------
# Dry run mode
# -----------------------------------------------------------------------------

if [[ "$MODE" == "dry-run" ]]; then
  tf_header "Dry Run - Would execute these tasks:"
  echo ""
  for task_id in "${FILTERED_TASKS[@]}"; do
    task_name=$(jq -r --arg task "$task_id" '.tasks[$task].name' "$TASKS_FILE")
    task_cmd=$(jq -r --arg task "$task_id" '.tasks[$task].command // ""' "$TASKS_FILE")
    printf "  %-10s %s\n" "$task_id" "$task_name"
    printf "      Command: %s\n" "$task_cmd"
  done
  tf_info "Dry run complete. $TASK_COUNT tasks would be dispatched."
  exit 0
fi

# -----------------------------------------------------------------------------
# Report mode
# -----------------------------------------------------------------------------

if [[ -n "$REPORT_FORMAT" ]]; then
  tf_header "Generating $REPORT_FORMAT report to $REPORT_OUTPUT..."
  tf_warn "Report generation not yet implemented. Use test-harness.sh --status for now."
  exit 0
fi

# -----------------------------------------------------------------------------
# Run mode
# -----------------------------------------------------------------------------

if [[ "$MODE" == "run" || "$MODE" == "once" ]]; then
  tf_header "Running tasks (${MODE})"
  
  # Create state directory for this run
  RUN_ID=$(date +%Y%m%d-%H%M%S)-$RANDOM
  RUN_DIR="$TF_STATE_DIR/runs/$RUN_ID"
  mkdir -p "$RUN_DIR"
  
  # Track results
  PASSED=0
  FAILED=0
  SKIPPED=0
  RUNNING=0
  
  # Status file
  STATUS_FILE="$RUN_DIR/status.json"
  jq -n '{"tasks": {}}' > "$STATUS_FILE"
  
  # Update task status helper
  update_status() {
    local task_id="$1"
    local status="$2"
    local message="$3"
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    local status_obj
    status_obj=$(jq -n \
      --arg task "$task_id" \
      --arg status "$status" \
      --arg message "$message" \
      --arg timestamp "$timestamp" \
      '{($task): {"status": $status, "message": $message, "timestamp": $timestamp}}')
    
    local tmp="$STATUS_FILE.tmp"
    jq --argjson new "$status_obj" '.tasks += $new' "$STATUS_FILE" > "$tmp" && mv "$tmp" "$STATUS_FILE"
  }
  
  # Get task definition
  get_task() {
    local task_id="$1"
    jq --arg task "$task_id" '.tasks[$task]' "$TASKS_FILE"
  }
  
  # Run a single task
  run_single_task() {
    local task_id="$1"
    local task_def
    task_def=$(get_task "$task_id")
    
    local task_name task_cmd task_accept task_scope task_timeout
    task_name=$(echo "$task_def" | jq -r '.name')
    task_cmd=$(echo "$task_def" | jq -r '.command // ""')
    task_accept=$(echo "$task_def" | jq -r '.accept // .command // ""')
    task_scope=$(echo "$task_def" | jq -r '.scope // [] | join(" ")')
    task_timeout=$(echo "$task_def" | jq -r '.timeout // 60')
    
    tf_info "Running: $task_id - $task_name"
    update_status "$task_id" "running" "Started"
    
    # For now, run in current directory (not worktree)
    # This is a simplified version
    local start_time
    start_time=$(date +%s)
    
    # Set timeout
    local full_cmd="timeout $((task_timeout * 60)) bash -c \"cd $TF_REPO_DIR && $task_accept\""
    
    tf_debug "Executing: $full_cmd"
    
    # Run command
    eval "$full_cmd" > "$RUN_DIR/${task_id}.log" 2>&1
    local exit_code=$?
    
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $exit_code -eq 0 ]]; then
      update_status "$task_id" "done" "Passed in ${duration}s"
      echo -e "  ${GREEN}✓${NC} $task_id passed in ${duration}s"
      PASSED=$((PASSED + 1))
    else
      update_status "$task_id" "failed" "Failed (exit $exit_code) in ${duration}s"
      echo -e "  ${RED}✗${NC} $task_id failed (exit $exit_code) in ${duration}s"
      FAILED=$((FAILED + 1))
      
      if [[ $TF_CONTINUE_ON_FAILURE -eq 0 ]]; then
        return 1
      fi
    fi
    
    return 0
  }
  
  # Run tasks sequentially for now (parallel execution would be more complex)
  for task_id in "${FILTERED_TASKS[@]}"; do
    if ! run_single_task "$task_id"; then
      if [[ $TF_CONTINUE_ON_FAILURE -eq 0 ]]; then
        break
      fi
    fi
  done
  
  # Summary
  echo ""
  tf_header "Run Summary"
  echo -e "  Total:  ${TOTAL_TASKS}"
  echo -e "  ${GREEN}Passed: ${PASSED}${NC}"
  echo -e "  ${RED}Failed: ${FAILED}${NC}"
  echo -e "  Skipped: ${SKIPPED}"
  echo ""
  
  if [[ $FAILED -gt 0 ]]; then
    echo "Failed tasks:"
    for task_id in "${FILTERED_TASKS[@]}"; do
      local status
      status=$(jq -r --arg task "$task_id" '.tasks[$task].status' "$STATUS_FILE")
      if [[ "$status" == "failed" ]]; then
        local message
        message=$(jq -r --arg task "$task_id" '.tasks[$task].message' "$STATUS_FILE")
        echo -e "  ${RED}✗${NC} $task_id: $message"
      fi
    done
    exit 1
  else
    exit 0
  fi
  
else
  tf_error "Unknown mode: $MODE"
  exit 2
fi
