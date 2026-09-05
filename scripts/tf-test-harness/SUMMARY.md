# Test Harness Improvement - Summary

## What Was Created

This directory contains a **TaskFleet-powered test harness improvement system** for World-Office. It uses the existing TaskFleet/wo-orchestrator infrastructure to dispatch and execute tasks that will upgrade the test harness.

## Files Created

### 1. `scripts/tf-test-harness/` - New Test Harness Directory
- **`test-harness.sh`** - Main unified test orchestrator (Uses TaskFleet libs)
- **`ROADMAP.md`** - Complete roadmap with 14 improvement tasks
- **`SUMMARY.md`** - This file
- **`README.md`** - Comprehensive documentation

### 2. `scripts/wo-orchestrator/config/tasks-harness.json`
- TaskFleet task definitions for 14 harness improvement tasks (TH-001 to TH-014)
- Each task has: scope, acceptance gate, dependencies, priority, tags, estimated hours

### 3. `scripts/wo-orchestrator/run-harness-improvements.sh`
- Wrapper script to run the orchestrator with harness tasks
- Setups up proper environment for harness improvement work
- Can be run with --status, --task, --dry-run, etc.

## The 14 Improvement Tasks

### Priority 1: Foundational (3 tasks)
1. **TH-001** - Create unified test orchestrator script
2. **TH-014** - Document test harness architecture  
3. **TH-013** - Create unified CI/CD pipeline

### Priority 2: Quality Gates (3 tasks)
4. **TH-003** - Harness graph drift check in CI
5. **TH-005** - Coverage reporting with cargo-llvm-cov
6. **TH-004** - Test parallelization support

### Priority 3: Automation (3 tasks)
7. **TH-002** - Generate test tasks from source
8. **TH-006** - Test impact analysis (affected tests)
9. **TH-007** - Mutation testing with cargo-mutants

### Priority 4: Advanced Testing (3 tasks)
10. **TH-008** - Visual regression testing
11. **TH-009** - Agent evaluation harness
12. **TH-010** - Performance/load testing

### Priority 5: Visibility (2 tasks)
13. **TH-011** - HTML/JSON test reports
14. **TH-012** - Harness graph feature mapping

## How to Use

### Quick Start
```bash
cd server/scripts/wo-orchestrator

# See all harness improvement tasks
./run-harness-improvements.sh --status

# Dry run to see what would execute
./run-harness-improvements.sh --dry-run

# Run all harness improvements
./run-harness-improvements.sh

# Run specific task
./run-harness-improvements.sh --task TH-001
```

### Use the New Test Harness (Once TH-001 is complete)
```bash
cd server/scripts/tf-test-harness

# Self-test the harness
./test-harness.sh --self-test

# Run all tests
./test-harness.sh

# Run only Rust tests
./test-harness.sh --category rust

# Run only fast tests
./test-harness.sh --fast

# Run tests affected by changes
./test-harness.sh --affected

# Generate HTML report
./test-harness.sh --report-html report.html
```

## Key Features of the New Design

### 1. TaskFleet Integration
- Uses the same libraries as `wo-orchestrator` (`common.sh`, `status.sh`, `worktree.sh`)
- Benefits from existing TaskFleet infrastructure (worktrees, locking, status tracking)
- Can dispatch to LLM workers or local CPU workers

### 2. Unified Test Model
- All test types are tasks: Rust unit, E2E, conformance, mutation, visual, agent, performance
- Each task has: ID, category, scope, command, accept gate, dependencies, priority
- Tasks can be filtered, selected, and executed in various ways

### 3. Flexible Execution Modes
- Run all tests, by category, by speed, by feature, affected only
- Parallel execution with configurable concurrency
- Dry-run mode for planning
- Sharding for CI parallelization
- Retry failed tests
- Test impact analysis

### 4. Quality Gates
- Harness graph drift check in CI
- Coverage threshold (configurable)
- Mutation score threshold (configurable)
- Pass rate threshold (configurable)
- All gates enforced in CI

### 5. Comprehensive Reporting
- JSON output for machine parsing
- HTML interactive dashboard
- Markdown for PR comments
- Category breakdowns
- Performance metrics (slowest tests)
- Failure details

### 6. Extensible Architecture
- Add new test types by adding tasks
- Add new test categories without modifying core
- Plug in new workers (LLM, custom)
- Support for custom acceptance gates

## Dependencies

The test harness requires these tools:

### System Dependencies
- `git` (with worktree support)
- `jq` (JSON processing)
- `flock` (file locking)
- `bash` 4+ 
- `cargo` (Rust build tool)
- `rustc` (Rust compiler)
- `pnpm` (Node.js package manager)
- `nodejs` 20+
- `python3` 3.8+
- `pi` (coding agent, for LLM workers)

### Cargo Plugins (for full functionality)
- `cargo-llvm-cov` (coverage reporting)
- `cargo-mutants` (mutation testing)
- `criterion` (benchmarks)

### NPM Packages
- `playwright` (E2E UI testing)
- `k6` (load testing)
- `pixelmatch` (visual regression)

### Python Packages
- `pytest` (test runner)

## Success Metrics

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Total automated tests | ~1,030 | 1,260+ | +230 |
| CI duration | 15+ min | < 5 min | -67% |
| Code coverage | Unknown | 70%+ | New |
| Mutation score | Unknown | 80%+ | New |
| Parallel workers | 1 | Configurable | New |
| Test impact support | No | Yes | New |
| Visual regression | Manual | Automated | New |
| Agent eval | No | Yes | New |
| Quality gates | Partial | Complete | Significant |

## Next Steps

1. **Immediate**: Run the TaskFleet orchestrator to execute TH-001 (Create unified test orchestrator)
   ```bash
   cd server/scripts/wo-orchestrator
   ./run-harness-improvements.sh --task TH-001
   ```

2. **Once TH-001 passes**: The new test-harness.sh will be functional. You can start using it immediately.

3. **Parallel execution**: Multiple tasks can run in parallel
   ```bash
   TF_MAX_PARALLEL=4 ./run-harness-improvements.sh
   ```

4. **Full execution**: Run all tasks
   ```bash
   ./run-harness-improvements.sh
   ```

5. **Track progress**: Check status anytime
   ```bash
   ./run-harness-improvements.sh --status
   ```

## Design Philosophy

1. **Leverage Existing Infrastructure**: Use TaskFleet's proven worktree, status, and dispatch system
2. **Treat Tests as Tasks**: Every test type is a dispatchable TaskFleet task
3. **Unified Interface**: One command (`test-harness.sh`) for all test operations
4. **Progressive Enhancement**: Each task adds a specific capability, tasks can be done in any order (mostly)
5. **Quality Gates**: Enforce minimum standards for code quality
6. **Observability**: Comprehensive reporting and status tracking
7. **Automation**: Reduce manual effort through smart test selection and parallelization

## Relationship to Existing Systems

### wo-orchestrator
- The new test harness **reuses** the same library files (`lib/*.sh`)
- Both shares common infrastructure (worktrees, status, locking)
- The new harness is **separate** - it runs tests, not implementation tasks
- But both can **coexist** and even **integrate**: engine rebuild tasks can include test validation

### harness-graph
- The existing harness graph tracks OnlyOffice parity features
- The new test harness **integrates** with it (TH-003, TH-012)
- Test selection can be based on harness graph features
- Feature coverage reports include test status

### Conformance Testing
- The existing wo-conformance crate is **preserved**
- The new harness **includes** conformance tests as a category
- Conformance tests are integrated into the unified execution model

### E2E Tests
- The existing E2E test suite (`tests/`) is **preserved**
- The new harness **dispatches** these tests as tasks
- E2E Docker stack is still used, but orchestrated via TaskFleet

## Files Modified

At this point, no existing files have been modified. All new files are additive:

- `scripts/tf-test-harness/` - New directory with test harness files
- `scripts/wo-orchestrator/config/tasks-harness.json` - New task definitions
- `scripts/wo-orchestrator/run-harness-improvements.sh` - New wrapper script

Future modifications (as tasks execute):
- `.forgejo/workflows/*.yml` - Updated CI/CD pipelines (TH-003, TH-013)
- `Cargo.toml` - Added cargo plugins (TH-005, TH-007, TH-010)
- `CONTRIBUTING.md` - Added testing documentation (TH-014)
- Various test configuration files

## Commit Message Template

```
Add TaskFleet-powered test harness improvements

This commit adds infrastructure for improving the World-Office test harness
using the TaskFleet agent orchestration system.

New files:
- scripts/tf-test-harness/ - Test harness with unified orchestrator
- scripts/wo-orchestrator/config/tasks-harness.json - 14 improvement tasks
- scripts/wo-orchestrator/run-harness-improvements.sh - Wrapper script

Features:
- Unified test model: all tests are TaskFleet tasks
- Flexible execution: by category, speed, feature, or affected files
- Parallel execution with configurable concurrency
- Quality gates: coverage, mutation score, harness graph
- Comprehensive reporting: JSON, HTML, Markdown
- Test impact analysis for faster CI

Random-Id: $RANDOM
```

## License

AGPL-3.0-or-later. Part of World-Office.
