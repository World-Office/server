# TaskFleet Test Harness

**Unified test orchestration for World-Office using TaskFleet**

This harness treats **all tests as TaskFleet tasks** - Rust unit tests, E2E integration tests, conformance testing, mutation testing, visual regression, and agent evaluation. Each test type becomes a dispatchable task with its own:
- **Scope**: Files/directories it can modify
- **Acceptance Gate**: Command that must pass
- **Dependencies**: Other tasks that must complete first
- **Priority**: Execution order
- **Worker Affinity**: Which LLM worker can run it

## Quick Start

```bash
cd server/scripts/tf-test-harness

# Self-test the harness (validates all task definitions)
./test-harness.sh --self-test

# See the test board (all tasks and their status)
./test-harness.sh --status

# Run all tests in parallel
./test-harness.sh

# Run only Rust tests
./test-harness.sh --category rust

# Run only fast tests (< 30s each)
./test-harness.sh --fast

# Run only tests affected by changed files
./test-harness.sh --affected
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TaskFleet Test Harness                       │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│  Test Categories → Tasks → Workers → Worktrees → Acceptance    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Rust Unit   │  │   E2E        │  │ Conformance  │          │
│  │  26 crates   │  │  Integration │  │  Rendering   │          │
│  │  930+ tests  │  │  100+ tests  │  │  30 cases    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Task Queue                            │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │   │
│  │  │ TF-001 │ │ TF-002 │ │ TF-100 │ │ TF-200 │ ...        │   │
│  │  │rust:wo │ │rust:wo-│ │ e2e:wo │ │ conv:  │            │   │
│  │  │ -common│ │  -html │ │ pi     │ │ case-1 │            │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Worker Pool                              │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                │   │
│  │  │ local-cpu │ │ zai-glm5  │ │ tud-mist  │                │   │
│  │  │ (default) │ │ (llm)     │ │ (llm)     │                │   │
│  │  └───────────┘ └───────────┘ └───────────┘                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                Worktrees & Execution                      │   │
│  │  .tf-worktrees/TF-001/  cargo test --package wo-common   │   │
│  │  .tf-worktrees/TF-100/  npm test                           │   │
│  │  .tf-worktrees/TF-200/  python3 scripts/run-pipeline.sh   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                              │
│  Results → state/task-status.json → Reports & Dashboards        │
└─────────────────────────────────────────────────────────────────┘
```

## Task Categories

| Category | Prefix | Count | Avg Duration | Description |
|----------|--------|-------|--------------|-------------|
| Rust Unit | `rust:` | 930+ | 5s | Per-crate unit tests |
| Rust Integration | `int:` | 50+ | 15s | Cross-crate integration |
| E2E WOPI | `e2e:wopi:` | 40 | 30s | WOPI protocol tests |
| E2E Health | `e2e:health:` | 15 | 20s | Service health checks |
| E2E Security | `e2e:sec:` | 25 | 25s | Security validation |
| E2E UI | `e2e:ui:` | 30 | 45s | Playwright UI tests |
| Conformance | `conv:` | 30 | 2min | Rendering fidelity |
| Mutation | `mut:` | 100+ | 3min | Mutation testing |
| Visual Regression | `vis:` | 20 | 1min | Screenshot comparison |
| Agent Eval | `agent:` | 10 | 5min | AI-generated edit validation |
| Performance | `perf:` | 10 | 2min | Load/stress tests |
| Coverage | `cov:` | 1 | 3min | Coverage reporting |

**Total: ~1,260 tasks**

## Test Selection

### By Category
```bash
./test-harness.sh --category rust       # All Rust tests
./test-harness.sh --category e2e        # All E2E tests
./test-harness.sh --category conv       # Conformance tests
./test-harness.sh --category mut        # Mutation tests
```

### By Speed
```bash
./test-harness.sh --fast     # Tests that complete in < 30s
./test-harness.sh --slow     # Tests that take 30s+
```

### By Changed Files (Test Impact Analysis)
```bash
./test-harness.sh --affected           # Auto-detect from git diff
./test-harness.sh --affected --base origin/main
./test-harness.sh --affected HEAD~1    # Changes since last commit
```

### By Feature (Harness Graph Integration)
```bash
./test-harness.sh --feature F-001      # Tests covering feature F-001
./test-harness.sh --feature wopi       # All WOPI-related tests
./test-harness.sh --feature rendering  # All rendering tests
```

### By Test ID
```bash
./test-harness.sh --task TF-001        # Specific test
./test-harness.sh --task TF-001 TF-002 TF-003
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TF_REPO_DIR` | `$PWD/../..` | Repository root |
| `TF_WORKTREE_ROOT` | `.tf-worktrees` | Worktree directory |
| `TF_STATE_DIR` | `state` | State/results directory |
| `TF_CONFIG_DIR` | `config` | Configuration directory |
| `TF_MAX_PARALLEL` | `$(nproc)` | Max concurrent tasks |
| `TF_POLL_SECONDS` | `5` | Polling interval |
| `TF_TIMEOUT_MINUTES` | `30` | Task timeout |
| `TF_CONTINUE_ON_FAILURE` | `0` | Continue after failures |
| `TF_CLEANUP_WORKTREES` | `1` | Clean up after completion |

### Worker Configuration

Workers are configured in `config/workers.json`:

```json
{
  "workers": {
    "local-cpu": {
      "type": "local",
      "command": "bash",
      "max_concurrent": 4,
      "tier": "fast",
      "can_run": ["rust", "e2e:health", "e2e:wopi", "cov"]
    },
    "zai-glm5": {
      "type": "llm",
      "provider": "zai",
      "model": "glm-5-turbo",
      "max_concurrent": 1,
      "tier": "slow",
      "can_run": ["agent", "mut"]
    }
  }
}
```

## Task Definition Format

Each test is defined in `config/tests.json`:

```json
{
  "TF-001": {
    "id": "TF-001",
    "name": "Rust: wo-common unit tests",
    "category": "rust",
    "package": "wo-common",
    "command": "cargo test -p wo-common --lib",
    "scope": ["core/crates/wo-common"],
    "accept": "cargo test -p wo-common --lib",
    "timeout": 60,
    "priority": 10,
    "dependencies": [],
    "features": ["F-001", "F-002"],
    "fast": true,
    "worker_affinity": ["local-cpu"],
    "description": "Unit tests for wo-common crate"
  }
}
```

### Task Generation

Tasks are **generated** from source code, not hand-maintained:

```bash
# Regenerate all test tasks from source
python3 scripts/generate-tests.py

# Validate task definitions
python3 scripts/generate-tests.py --check

# Show generation summary
python3 scripts/generate-tests.py --summary
```

## Acceptance Gates

Each task has an acceptance gate that must pass for the task to be marked as `done`:

### Rust Tests
```bash
# Unit tests
cargo test -p <package> --lib -- --test-threads=1

# Integration tests
cargo test -p <package> --test <test_name>
```

### E2E Tests
```bash
# Run specific test file
npm test -- tests/e2e/wopi/check-file-info.test.js

# Run with timeout
timeout 120 npm test -- tests/e2e/wopi/
```

### Conformance Tests
```bash
# Run full pipeline
./scripts/run-pipeline.sh --threshold 0.95

# Single case
wo-conformance diff engine.json truth.json --threshold 0.95
```

### Mutation Tests
```bash
# Run mutation testing
cargo mutants run --package <package>

# Check mutation score
cargo mutants results --threshold 95
```

### Visual Regression
```bash
# Capture baselines (update mode)
TF_UPDATE_GOLDEN=1 ./scripts/visual-regression.sh

# Compare against baselines
./scripts/visual-regression.sh --threshold 0.99
```

### Coverage
```bash
# Generate coverage report
cargo llvm-cov --workspace --output-dir coverage --lcov

# Check coverage threshold
cargo llvm-cov --workspace --threshold 80
```

## Test Result Reporting

### JSON Status
```bash
./test-harness.sh --status --json
```

Example output:
```json
{
  "summary": {
    "total": 1260,
    "passed": 1245,
    "failed": 15,
    "running": 0,
    "pending": 0,
    "pass_rate": 98.8,
    "duration_seconds": 428
  },
  "categories": {
    "rust": {"total": 980, "passed": 978, "failed": 2, "pass_rate": 99.8},
    "e2e": {"total": 155, "passed": 152, "failed": 3, "pass_rate": 98.1},
    "conformance": {"total": 30, "passed": 30, "failed": 0, "pass_rate": 100},
    "mutation": {"total": 50, "passed": 40, "failed": 10, "pass_rate": 80},
    "visual": {"total": 20, "passed": 18, "failed": 2, "pass_rate": 90},
    "agent": {"total": 10, "passed": 8, "failed": 2, "pass_rate": 80},
    "performance": {"total": 10, "passed": 10, "failed": 0, "pass_rate": 100},
    "coverage": {"total": 1, "passed": 1, "failed": 0, "pass_rate": 100}
  },
  "slowest": [
    {"task": "mut:wo-docx-renderer", "duration": 185},
    {"task": "conv:full-pipeline", "duration": 120},
    {"task": "e2e:ui:coediting", "duration": 95}
  ],
  "failed": [
    {"task": "mut:wo-pdf-001", "error": "Mutation score below threshold"},
    {"task": "e2e:sec:xss-001", "error": "Assertion failed"}
  ]
}
```

### HTML Report
```bash
./test-harness.sh --report-html report.html
```

Generates an interactive HTML dashboard with:
- Overall statistics
- Category breakdowns
- Timeline of execution
- Failed test details
- Performance metrics

### Markdown Summary
```bash
./test-harness.sh --report-md REPORT.md
```

Perfect for PR comments and commit messages.

## CI Integration

### GitHub Actions / Forgejo Actions

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup environment
        run: |
          # Install dependencies
          sudo apt-get update
          sudo apt-get install -y jq flock git
          
          # Install Rust
          curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
          
          # Install Node.js
          curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
          sudo apt-get install -y nodejs
          
      - name: Generate test tasks
        run: cd server/scripts/tf-test-harness && python3 scripts/generate-tests.py
        
      - name: Run affected tests
        run: cd server/scripts/tf-test-harness && ./test-harness.sh --affected --fast
        
      - name: Run full test suite
        if: github.ref == 'refs/heads/main'
        run: cd server/scripts/tf-test-harness && ./test-harness.sh --all
        
      - name: Generate coverage report
        run: cd server/scripts/tf-test-harness && ./test-harness.sh --report-html coverage.html
        
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: test-coverage
          path: server/scripts/tf-test-harness/coverage.html
        
      - name: Upload test results
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: server/scripts/tf-test-harness/state/
```

### Acceptance Gates in CI

```yaml
jobs:
  test:
    steps:
      # ... setup ...
      
      - name: Run tests
        id: tests
        run: cd server/scripts/tf-test-harness && ./test-harness.sh --all --json > results.json
        
      - name: Check pass rate
        run: |
          PASS_RATE=$(jq '.summary.pass_rate' results.json)
          if (( $(echo "$PASS_RATE < 95" | bc -l) )); then
            echo "Pass rate $PASS_RATE% is below 95% threshold"
            exit 1
          fi
          
      - name: Check mutation score
        run: |
          MUTATION SCORE=$(jq '.categories.mutation.pass_rate' results.json)
          if (( $(echo "$MUTATION SCORE < 80" | bc -l) )); then
            echo "Mutation score $MUTATION SCORE% is below 80% threshold"
            exit 1
          fi
          
      - name: Check coverage
        run: |
          COVERAGE=$(jq '.categories.coverage.pass_rate' results.json)
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
```

## Local Development

### Running Tests During Development

```bash
# Watch mode: re-run affected tests on file changes
./test-harness.sh --watch

# Interactive mode: pick tests from a menu
./test-harness.sh --interactive

# Debug mode: show full output for failing tests
./test-harness.sh --debug
```

### Quick Feedback Loop

```bash
# Run only tests for current crate
./test-harness.sh --current-crate

# Run only tests for changed files since last commit
./test-harness.sh --since HEAD~1

# Run test and re-run on failure (for debugging)
./test-harness.sh --task TF-001 --retry
```

## Advanced Usage

### Custom Test Decorators

Add custom behavior to tests using decorators:

```json
{
  "TF-001": {
    "decorators": [
      "@slow",           // Mark as slow test
      "@flaky",          // Mark as flaky (auto-retry)
      "@nightly",        // Only run on nightly CI
      "@requires-docker", // Requires Docker
      "@requires-gpu"    // Requires GPU
    ]
  }
}
```

### Test Sharding

Split tests across multiple CI jobs:

```bash
# Job 1: Run first half of tests
./test-harness.sh --shard 0 --shards 2

# Job 2: Run second half of tests
./test-harness.sh --shard 1 --shards 2
```

### Test Retries

```bash
# Retry failed tests (up to 3 times)
./test-harness.sh --retry 3

# Retry specific test
./test-harness.sh --task TF-001 --retry
```

### Custom Workers

Add custom workers for specific test types:

```json
{
  "MyCustomWorker": {
    "type": "custom",
    "command": "/path/to/my/test/runner.sh",
    "max_concurrent": 2,
    "can_run": ["custom:*"]
  }
}
```

## Integration with Existing Harnesses

### Harness Graph Integration

```bash
# Check that harness graph is up to date
./test-harness.sh --check-harness-graph

# Generate tests from harness graph features
./test-harness.sh --generate-from-harness-graph

# Run tests for specific harness graph feature
./test-harness.sh --feature F-001 --feature F-002
```

### Agent Eval Harness Integration

```bash
# Run agent evaluation tests
./test-harness.sh --category agent

# Validate agent-generated edits
./test-harness.sh --task agent:edit-validation-001

# Check mutation score for agent surface
./test-harness.sh --mutation-score-agent --threshold 100
```

### TaskFleet Orchestrator Integration

```bash
# Import tasks from wo-orchestrator
./test-harness.sh --import-taskfleet-config

# Export test results to wo-orchestrator format
./test-harness.sh --export-taskfleet

# Run test harness as part of engine rebuild
./test-harness.sh --mode engine-rebuild
```

## Troubleshooting

### Common Issues

1. **Tests hanging / timing out**
   ```bash
   # Increase timeout
   TF_TIMEOUT_MINUTES=60 ./test-harness.sh
   
   # Run with debug output
   ./test-harness.sh --debug
   ```

2. **Worktrees not being cleaned up**
   ```bash
   # Force cleanup
   ./test-harness.sh --cleanup
   
   # Manual cleanup
   rm -rf .tf-worktrees/
   ```

3. **Missing dependencies**
   ```bash
   # Check what's missing
   ./test-harness.sh --check-deps
   
   # Install dependencies
   ./test-harness.sh --install-deps
   ```

4. **Flaky tests**
   ```bash
   # Mark test as flaky (auto-retry)
   ./test-harness.sh --mark-flaky TF-001
   
   # Run flaky tests multiple times
   ./test-harness.sh --flaky-retries 3
   ```

5. **Permission issues**
   ```bash
   # Run with sudo (not recommended)
   sudo ./test-harness.sh
   
   # Or fix permissions
   chmod -R u+rw .tf-worktrees/
   chmod -R u+rw state/
   ```

### Debug Commands

```bash
# List all tasks with details
./test-harness.sh --list

# Show task definition
./test-harness.sh --task TF-001 --show

# Show worker status
./test-harness.sh --workers

# Show worktree status
./test-harness.sh --worktrees

# Show full logs for a task
./test-harness.sh --task TF-001 --logs

# Attach to running task output
./test-harness.sh --attach TF-001
```

## Performance Optimization

### Caching

```bash
# Enable cargo caching
TF_CARGO_CACHE=1 ./test-harness.sh

# Enable npm caching
TF_NPM_CACHE=1 ./test-harness.sh

# Use shared cargo target directory
TF_CARGO_TARGET=/tmp/cargo-target ./test-harness.sh
```

### Parallelism

```bash
# Max parallelism
TF_MAX_PARALLEL=16 ./test-harness.sh

# Parallel by category
./test-harness.sh --parallel-categories

# Parallel Docker containers
TF_DOCKER_PARALLEL=4 ./test-harness.sh
```

### Incremental Testing

```bash
# Only run tests affected by changes
./test-harness.sh --affected

# Cache test results for unchanged code
TF_CACHE_RESULTS=1 ./test-harness.sh

# Skip tests that passed last run
./test-harness.sh --skip-passed
```

## File Structure

```
tf-test-harness/
├── config/
│   ├── tasks.json          # Generated test task definitions
│   ├── workers.json        # Worker configurations
│   └── settings.json       # Harness settings
├── state/
│   ├── task-status.json    # Current task states
│   ├── results/            # Test results by run
│   └── logs/               # Full task logs
├── scripts/
│   ├── generate-tests.py   # Generate tasks from source
│   ├── select-tests.py     # Test impact analysis
│   ├── report.py           # Generate reports
│   └── ...
├── prompts/
│   └── test-worker.md      # LLM worker prompt
├── lib/
│   ├── common.sh           # Shared utilities
│   ├── test-discovery.sh   # Discover tests from source
│   ├── test-runner.sh      # Run individual tests
│   └── ...
├── tests/
│   └── run-all-tests.sh    # Self-tests for the harness
├── test-harness.sh         # Main entry point
└── README.md               # This file
```

## License

AGPL-3.0-or-later. Part of World-Office.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run the self-tests: `./tests/run-all-tests.sh`
5. Submit a pull request

## See Also

- [World-Office README](../../README.md)
- [wo-orchestrator](../wo-orchestrator/README.md) - Agent task orchestration
- [Harness Graph](../harness-graph/README.md) - OnlyOffice parity tracking
- [Conformance Testing](../../core/crates/wo-conformance/README.md) - Rendering fidelity
