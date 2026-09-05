# Test Harness Improvement Roadmap

**Using TaskFleet to upgrade World-Office test infrastructure**

## Overview

This roadmap defines **14 tasks** as TaskFleet jobs that will transform the World-Office test harness from a fragmented collection of test systems into a **unified, automated, visible** testing ecosystem.

Each task:
- Has a clear **scope** (files it can modify)
- Has a clear **acceptance gate** (command that must pass)
- Can be **dispatched to LLM workers** via the orchestrator
- Can be **tracking manually** via the status board

## Task Categories & Priority Order

### Priority 1: Foundational (Must have first)
These tasks create the core infrastructure that other improvements depend on.

| ID | Title | Effort | Acceptance Gate | Dependencies |
|----|-------|--------|-----------------|--------------|
| **TH-001** | Create unified test orchestrator script | 4h | Passes self-test (29 tests) | None |
| **TH-014** | Document test harness architecture | 2h | README.md complete | TH-001 |
| **TH-013** | Create unified CI/CD pipeline | 3h | CI workflow has all gates | TH-003, TH-005, TH-004 |

### Priority 2: Quality Gates (Critical for code quality)
These add the validation gates that ensure code quality.

| ID | Title | Effort | Acceptance Gate | Dependencies |
|----|-------|--------|-----------------|--------------|
| **TH-003** | Harness graph drift check in CI | 2h | CI includes graph check | None |
| **TH-005** | Coverage reporting with cargo-llvm-cov | 3h | Coverage >= 70% | TH-001 |
| **TH-004** | Test parallelization support | 4h | 8x speedup on Rust tests | TH-001, TH-002 |

### Priority 3: Automation (Reduce manual effort)
These automate test execution and selection.

| ID | Title | Effort | Acceptance Gate | Dependencies |
|----|-------|--------|-----------------|--------------|
| **TH-002** | Generate test tasks from source | 6h | 900+ tasks generated | TH-001 |
| **TH-006** | Test impact analysis | 4h | --affected selects correctly | TH-001, TH-002 |
| **TH-007** | Mutation testing with cargo-mutants | 5h | Mutation score >= 80% | TH-001 |

### Priority 4: Advanced Testing (Extended capabilities)
These add specialized testing types.

| ID | Title | Effort | Acceptance Gate | Dependencies |
|----|-------|--------|-----------------|--------------|
| **TH-008** | Visual regression testing | 4h | pixelmatch comparison works | TH-001 |
| **TH-009** | Agent evaluation harness | 6h | Agent edits validated | TH-001, TH-007 |
| **TH-010** | Performance/load testing | 4h | Load test completes | TH-001 |

### Priority 5: Visibility (Reporting & dashboards)
These improve observability of test results.

| ID | Title | Effort | Acceptance Gate | Dependencies |
|----|-------|--------|-----------------|--------------|
| **TH-011** | HTML/JSON test reports | 3h | Reports generated | TH-001, TH-002, TH-005 |
| **TH-012** | Harness graph feature mapping | 4h | --feature flag works | TH-003, TH-006 |

## Execution Plan

### Option A: Run All Sequentially
```bash
cd server/scripts/wo-orchestrator
./run-harness-improvements.sh
```
This runs all 14 tasks in dependency order, dispatching to available LLM workers.

### Option B: Run by Priority
```bash
# Priority 1: Foundational
./run-harness-improvements.sh --task TH-001
./run-harness-improvements.sh --task TH-014
./run-harness-improvements.sh --task TH-013

# Priority 2: Quality Gates
./run-harness-improvements.sh --task TH-003
./run-harness-improvements.sh --task TH-005
./run-harness-improvements.sh --task TH-004

# etc...
```

### Option C: Run in Parallel (with multiple workers)
```bash
# Configure workers in config-harness/workers.json
# Then run with max parallel
TF_MAX_PARALLEL=4 ./run-harness-improvements.sh
```

### Option D: Dry Run First
```bash
./run-harness-improvements.sh --dry-run
```
Shows what would run without modifying anything.

### Option E: Manual Execution
Each task can also be executed manually using its acceptance gate:

```bash
# TH-001: Create unified orchestrator
# Accept: bash scripts/tf-test-harness/test-harness.sh --self-test

# TH-003: Harness graph CI gate
# Accept: python3 scripts/harness-graph/seed.py --check

# etc...
```

## Dependency Graph

```
                    ┌───────────────┐
                    │   TH-001      │ ← Foundational
                    │ (Orchestrator)│
                    └───────┬───────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
┌───────▼───────┐                     ┌────────▼────────┐
│   TH-002      │                     │     TH-014      │
│ (Task Gen)    │                     │   (Document)    │
└───────┬───────┘                     └─────────────────┘
        │
        │
┌───────▼───────┐
│   TH-004      │ ← Quality Gates
│ (Parallelism) │
└───────┬───────┘
        │
┌───────▼───────┐
│   TH-006      │ ← Automation
│ (Impact)      │
└───────────────┘

┌───────┐     ┌───────┐     ┌───────┐
│ TH-005 │     │ TH-007 │     │ TH-008 │ ← Advanced
│ (Coverage)│   │ (Mutation)│   │ (Visual)│
└───────┘     └───────┘     └───────┘
        │
        │
┌───────▼───────┐
│   TH-011      │ ← Visibility
│ (Reports)     │
└───────┬───────┘
        │
┌───────▼───────┐
│   TH-012      │
│ (Feature Map) │
└───────────────┘
```

## Success Metrics

| Metric | Before | Target (After) | Difference |
|--------|--------|-----------------|------------|
| Total automated tests | ~900 Rust + ~100 E2E | 1,260+ unified | +260 |
| CI duration | 15+ minutes | < 5 minutes | -10 min |
| Code coverage | Unknown | 70%+ | +70% |
| Mutation score | Unknown | 80%+ | +80% |
| Parallel workers | 1 (sequential) | Configurable | +Nx speed |
| Test impact support | No | Yes | New |
| Visual regression | Manual | Automated | New |
| Agent eval | No | Yes | New |
| Quality gates in CI | Partial | Complete | Significant |

## File Changes Summary

Each task modifies files only within its scope. Here's the full picture:

### TH-001: Unified Orchestrator
- **Creates**: `scripts/tf-test-harness/test-harness.sh`
- **Creates**: `scripts/tf-test-harness/README.md`
- **Creates**: `scripts/tf-test-harness/lib/*.sh`
- **Creates**: `scripts/tf-test-harness/config/`

### TH-002: Test Task Generation
- **Creates**: `scripts/tf-test-harness/scripts/generate-tests.py`
- **Creates**: `scripts/tf-test-harness/config/tasks.json`

### TH-003: Harness Graph CI Gate
- **Modifies**: `.forgejo/workflows/e2e.yml`
- **Modifies**: `.forgejo/workflows/ci.yml`

### TH-004: Test Parallelization
- **Modifies**: `scripts/tf-test-harness/test-harness.sh`
- **Creates**: `scripts/tf-test-harness/lib/parallel.sh`

### TH-005: Coverage Reporting
- **Modifies**: `scripts/tf-test-harness/test-harness.sh`
- **Creates**: `scripts/tf-test-harness/lib/coverage.sh`
- **Modifies**: `.forgejo/workflows/ci.yml`

### TH-006: Test Impact Analysis
- **Creates**: `scripts/tf-test-harness/scripts/select-tests.py`
- **Creates**: `scripts/tf-test-harness/lib/impact.sh`

### TH-007: Mutation Testing
- **Creates**: `scripts/tf-test-harness/scripts/mutation-test.py`
- **Creates**: `scripts/tf-test-harness/lib/mutation.sh`
- **Modifies**: `Cargo.toml` (add cargo-mutants)

### TH-008: Visual Regression
- **Creates**: `scripts/tf-test-harness/scripts/visual-regression.sh`
- **Creates**: `scripts/tf-test-harness/lib/visual.sh`
- **Creates**: `tests/golden/images/`

### TH-009: Agent Evaluation
- **Creates**: `scripts/tf-test-harness/scripts/agent-eval.py`
- **Creates**: `scripts/tf-test-harness/logic/agent-eval/`

### TH-010: Performance/Load Testing
- **Creates**: `scripts/tf-test-harness/scripts/load-test.sh`
- **Creates**: `scripts/tf-test-harness/scripts/stress-test.sh`
- **Creates**: `scripts/tf-test-harness/lib/performance.sh`
- **Modifies**: `Cargo.toml` (add criterion)

### TH-011: HTML/JSON Reports
- **Creates**: `scripts/tf-test-harness/scripts/report.py`
- **Creates**: `scripts/tf-test-harness/lib/reporting.sh`

### TH-012: Harness Graph Integration
- **Modifies**: `scripts/tf-test-harness/scripts/generate-tests.py`
- **Creates**: `scripts/tf-test-harness/lib/feature-mapping.sh`

### TH-013: Unified CI/CD Pipeline
- **Creates/Modifies**: `.forgejo/workflows/test-harness.yml`
- **Creates/Modifies**: `.forgejo/workflows/test.yml`

### TH-014: Documentation
- **Modifies**: `scripts/tf-test-harness/README.md`
- **Creates**: `scripts/tf-test-harness/docs/*`
- **Modifies**: `CONTRIBUTING.md`

## Running Individual Tasks

### TH-001: Create Unified Orchestrator
```bash
# Acceptance gate
bash scripts/tf-test-harness/test-harness.sh --self-test

# Manual test
cd scripts/tf-test-harness
./test-harness.sh --status
./test-harness.sh --help
```

### TH-002: Generate Test Tasks
```bash
# Acceptance gate
python3 scripts/tf-test-harness/scripts/generate-tests.py --check

# Manual test
python3 scripts/tf-test-harness/scripts/generate-tests.py
jq '.tasks | length' scripts/tf-test-harness/config/tasks.json
```

### TH-003: Harness Graph CI Gate
```bash
# Acceptance gate
python3 scripts/harness-graph/seed.py --check

# Manual test
cd scripts/harness-graph
python3 seed.py --report | head -20
```

### TH-004: Test Parallelization
```bash
# Acceptance gate
timeout 120 bash scripts/tf-test-harness/test-harness.sh --category rust --max-parallel 4 --fast

# Manual test
time bash scripts/tf-test-harness/test-harness.sh --category rust --fast --max-parallel 1
time bash scripts/tf-test-harness/test-harness.sh --category rust --fast --max-parallel 4
```

### TH-005: Coverage Reporting
```bash
# Acceptance gate
bash scripts/tf-test-harness/test-harness.sh --category rust --coverage --threshold 70

# Manual test
cargo llvm-cov --workspace --output-dir coverage --lcov
```

### TH-006: Test Impact Analysis
```bash
# Acceptance gate
python3 scripts/tf-test-harness/scripts/select-tests.py --base origin/main --list

# Manual test
# Make a change, then:
bash scripts/tf-test-harness/test-harness.sh --affected --dry-run
```

### TH-007: Mutation Testing
```bash
# Acceptance gate
cargo mutants run --package wo-common --threshold 80

# Manual test
cargo mutants run --package wo-common
cargo mutants results
```

### TH-008: Visual Regression
```bash
# Acceptance gate (update mode)
TF_UPDATE_GOLDEN=1 bash scripts/tf-test-harness/scripts/visual-regression.sh --sample

# Acceptance gate (compare mode)
bash scripts/tf-test-harness/scripts/visual-regression.sh --threshold 0.99

# Manual test
ls tests/golden/images/ | head -10
```

### TH-009: Agent Evaluation
```bash
# Acceptance gate
python3 scripts/tf-test-harness/scripts/agent-eval.py --validate

# Manual test
# Generate an agent edit and validate it
```

### TH-010: Performance/Load Testing
```bash
# Acceptance gate
bash scripts/tf-test-harness/scripts/load-test.sh --users 10 --duration 30

# Manual test
bash scripts/tf-test-harness/scripts/load-test.sh --users 50 --duration 60
```

### TH-011: HTML/JSON Reports
```bash
# Acceptance gate
bash scripts/tf-test-harness/test-harness.sh --category rust --fast --report-html test-report.html

# Manual test
bash scripts/tf-test-harness/test-harness.sh --category rust --fast --report-json results.json
cat results.json | jq .
```

### TH-012: Harness Graph Integration
```bash
# Acceptance gate
python3 scripts/tf-test-harness/scripts/generate-tests.py --from-harness-graph

# Manual test
bash scripts/tf-test-harness/test-harness.sh --feature F-001 --dry-run
```

### TH-013: Unified CI/CD Pipeline
```bash
# Acceptance gate
grep -q 'harness-graph' .forgejo/workflows/test.yml

# Manual test
cat .forgejo/workflows/test-harness.yml | head -50
```

### TH-014: Documentation
```bash
# Acceptance gate
test -f scripts/tf-test-harness/README.md
grep -q 'Quick Start' scripts/tf-test-harness/README.md

# Manual test
cat scripts/tf-test-harness/README.md | head -20
```

## Tracking Progress

### Status Board
```bash
cd server/scripts/wo-orchestrator
./run-harness-improvements.sh --status
```

Shows:
- Total tasks: 14
- Completed: X
- In progress: Y
- Pending: Z
- Failed: W

### Individual Task Status
```bash
./run-harness-improvements.sh api status --task TH-001
```

### Cost Report (for LLM workers)
```bash
./run-harness-improvements.sh cost
```

## Troubleshooting

### "No tasks found"
```bash
# Regenerate the tasks from the roadmap
python3 scripts/tf-test-harness/scripts/generate-from-roadmap.py
```

### "Accept gate failed"
Each task's acceptance gate must pass. Check the specific task:
```bash
# For TH-001
bash scripts/tf-test-harness/test-harness.sh --self-test
```

### "Worker not available"
Configure workers in `scripts/wo-orchestrator/config-harness/workers.json`:
```json
{
  "workers": {
    "local-cpu": {
      "type": "local",
      "command": "bash",
      "max_concurrent": 4,
      "can_run": ["test-harness"]
    }
  }
}
```

### "Permission denied"
```bash
chmod +x scripts/wo-orchestrator/run-harness-improvements.sh
```

## See Also

- [Test Harness README](README.md) - Usage and architecture
- [Unified Test Orchestrator](test-harness.sh) - Main test runner
- [TaskFleet Orchestrator](../wo-orchestrator/README.md) - Agent task orchestration
- [Harness Graph](../../harness-graph/README.md) - OnlyOffice parity tracking
- [Conformance Testing](../../../core/crates/wo-conformance/README.md) - Rendering fidelity

## License

AGPL-3.0-or-later. Part of World-Office.
