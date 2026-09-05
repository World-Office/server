#!/usr/bin/env python3
"""
generate-tests.py — Generate TaskFleet test tasks from World-Office source code.

Discovers all testable units:
- Rust crates and their tests (from Cargo.toml)
- JavaScript/TypeScript tests (from package.json)
- Python tests (from pytest configuration)
- E2E tests (from test directories)
- Conformance tests
- Mutation tests
- Visual regression tests
- Performance tests

Usage:
    python3 generate-tests.py                    # Generate tasks.json
    python3 generate-tests.py --check           # Validate existing tasks.json
    python3 generate-tests.py --summary         # Show generation summary
    python3 generate-tests.py --from-harness-graph # Include harness graph features

Output:
    Writes to config/tasks.json (or specified --output file)
"""

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
REPO_DIR = SCRIPT_DIR.parent.parent.parent.resolve()
CONFIG_DIR = SCRIPT_DIR / "config"
DEFAULT_OUTPUT = CONFIG_DIR / "tasks.json"

# Task categories
CATEGORY_RUST = "rust"
CATEGORY_RUST_INT = "int"  # Integration
CATEGORY_E2E = "e2e"
CATEGORY_E2E_WOPI = "e2e:wopi"
CATEGORY_E2E_HEALTH = "e2e:health"
CATEGORY_E2E_SECURITY = "e2e:sec"
CATEGORY_E2E_UI = "e2e:ui"
CATEGORY_CONFORMANCE = "conv"
CATEGORY_MUTATION = "mut"
CATEGORY_VISUAL = "vis"
CATEGORY_AGENT = "agent"
CATEGORY_PERFORMANCE = "perf"
CATEGORY_COVERAGE = "cov"


@dataclass
class TestTask:
    """Represents a TaskFleet test task."""
    id: str
    name: str
    category: str
    command: str
    accept: str
    scope: List[str] = field(default_factory=list)
    deps: List[str] = field(default_factory=list)
    priority: int = 100
    timeout: int = 60  # seconds
    fast: bool = True
    features: List[str] = field(default_factory=list)
    worker_affinity: List[str] = field(default_factory=list)
    description: str = ""
    manual: bool = False
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        """Convert to dictionary, omitting empty fields."""
        result = {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "command": self.command,
            "accept": self.accept,
            "scope": self.scope,
            "deps": self.deps,
            "priority": self.priority,
            "timeout": self.timeout,
            "fast": self.fast,
            "features": self.features,
            "worker_affinity": self.worker_affinity if self.worker_affinity else ["local-cpu"],
            "description": self.description,
            "manual": self.manual,
            "tags": self.tags,
        }
        return {k: v for k, v in result.items() if v or isinstance(v, bool) and v is not False}


class TestGenerator:
    """Generates test tasks from repository structure."""

    def __init__(self, repo_dir: Path, include_slow: bool = True):
        self.repo_dir = repo_dir
        self.include_slow = include_slow
        self.tasks: List[TestTask] = []
        self.task_counter: Dict[str, int] = {}
        self.crate_tests: Dict[str, List[TestTask]] = {}
        self.e2e_tests: List[TestTask] = []
        self.conformance_tests: List[TestTask] = []
        self.mutation_tests: List[TestTask] = []
        self.visual_tests: List[TestTask] = []
        self.agent_tests: List[TestTask] = []
        self.performance_tests: List[TestTask] = []
        self.coverage_tasks: List[TestTask] = []

    def next_id(self, prefix: str) -> str:
        """Generate next task ID for a prefix."""
        self.task_counter[prefix] = self.task_counter.get(prefix, 0) + 1
        return f"{prefix}-{self.task_counter[prefix]:03d}"

    # -------------------------------------------------------------------------
    # Rust Test Discovery
    # -------------------------------------------------------------------------

    def discover_rust_crates(self) -> List[Tuple[str, Path, Dict]]:
        """Find all Rust crates in the workspace."""
        crates = []
        
        # Look for Cargo.toml files
        cargo_files = list(self.repo_dir.rglob("Cargo.toml"))
        cargo_files = [f for f in cargo_files if "target" not in str(f)]
        
        for cargo_file in cargo_files:
            try:
                # Check if it's a workspace member
                cargo_dir = cargo_file.parent
                manifest = self._read_toml(cargo_file)
                
                package_name = manifest.get("package", {}).get("name", "")
                if not package_name:
                    continue
                
                # Skip workspace root
                if cargo_dir == self.repo_dir:
                    continue
                
                # Get relative path
                rel_path = cargo_dir.relative_to(self.repo_dir)
                
                crates.append((package_name, cargo_dir, manifest))
            except Exception as e:
                print(f"Warning: Could not read {cargo_file}: {e}")
        
        return crates

    def _read_toml(self, path: Path) -> Dict:
        """Read a TOML file."""
        import tomli
        with open(path, "rb") as f:
            return tomli.load(f)

    def _has_tests(self, cargo_dir: Path) -> bool:
        """Check if a crate has tests."""
        tests_dir = cargo_dir / "tests"
        src_dir = cargo_dir / "src"
        
        # Check for test files
        if tests_dir.exists() and list(tests_dir.glob("*.rs")):
            return True
        
        # Check for test modules in src
        for rs_file in src_dir.rglob("*.rs"):
            if rs_file.name.startswith("test_") or "#[test]" in rs_file.read_text():
                return True
        
        return False

    def _get_test_command(self, package_name: str, is_integration: bool = False) -> str:
        """Get cargo test command for a package."""
        if is_integration:
            return f"cargo test -p {package_name} --test '*'"
        return f"cargo test -p {package_name} --lib"

    def _get_accept_command(self, package_name: str, is_integration: bool = False) -> str:
        """Get acceptance command (same as test command for Rust)."""
        return self._get_test_command(package_name, is_integration)

    def generate_rust_tasks(self):
        """Generate tasks for Rust crates."""
        crates = self.discover_rust_crates()
        
        for package_name, cargo_dir, manifest in crates:
            rel_path = str(cargo_dir.relative_to(self.repo_dir))
            
            # Unit tests
            if self._has_tests(cargo_dir):
                task_id = self.next_id(CATEGORY_RUST)
                task = TestTask(
                    id=task_id,
                    name=f"Rust: {package_name} unit tests",
                    category=CATEGORY_RUST,
                    command=self._get_test_command(package_name),
                    accept=self._get_accept_command(package_name),
                    scope=[rel_path],
                    timeout=120,
                    fast=package_name in ["wo-common", "wo-path", "wo-range"],
                    features=[],
                    description=f"Unit tests for {package_name} crate",
                    tags=["rust", "unit", package_name],
                )
                self.tasks.append(task)
                self.crate_tests[package_name] = [task]
            
            # Integration tests (if separate)
            tests_dir = cargo_dir / "tests"
            if tests_dir.exists():
                test_files = list(tests_dir.glob("*.rs"))
                if test_files:
                    for test_file in test_files:
                        test_name = test_file.stem.replace("test_", "").replace("_", "-")
                        task_id = self.next_id(CATEGORY_RUST_INT)
                        task = TestTask(
                            id=task_id,
                            name=f"Rust: {package_name} integration - {test_name}",
                            category=CATEGORY_RUST_INT,
                            command=f"cargo test -p {package_name} --test {test_file.stem}",
                            accept=f"cargo test -p {package_name} --test {test_file.stem}",
                            scope=[rel_path],
                            timeout=120,
                            fast=False,
                            deps=[self.crate_tests[package_name][0].id] if package_name in self.crate_tests else [],
                            description=f"Integration test: {test_file.stem}",
                            tags=["rust", "integration", package_name],
                        )
                        self.tasks.append(task)

    # -------------------------------------------------------------------------
    # E2E Test Discovery
    # -------------------------------------------------------------------------

    def discover_e2e_tests(self):
        """Discover E2E tests from the test suite."""
        e2e_dir = self.repo_dir / "tests" / "e2e"
        
        if not e2e_dir.exists():
            return
        
        # WOPI tests
        wopi_dir = e2e_dir / "wopi"
        if wopi_dir.exists():
            wopi_tests = list(wopi_dir.glob("*.test.js")) + list(wopi_dir.glob("*.spec.js"))
            for test_file in wopi_tests:
                test_name = test_file.stem.replace(".test", "").replace(".spec", "")
                task_id = self.next_id(CATEGORY_E2E_WOPI)
                task = TestTask(
                    id=task_id,
                    name=f"E2E: WOPI - {test_name}",
                    category=CATEGORY_E2E_WOPI,
                    command=f"npm test -- tests/e2e/wopi/{test_file.name}",
                    accept=f"npm test -- tests/e2e/wopi/{test_file.name}",
                    scope=["tests/e2e/wopi"],
                    timeout=60,
                    fast=True,
                    features=["F-001", "F-002", "F-003"],  # Example features
                    description=f"WOPI protocol test: {test_name}",
                    tags=["e2e", "wopi", "protocol"],
                )
                self.tasks.append(task)
                self.e2e_tests.append(task)
        
        # Health tests
        health_dir = e2e_dir / "health"
        if health_dir.exists():
            health_tests = list(health_dir.glob("*.test.js"))
            for test_file in health_tests:
                test_name = test_file.stem.replace(".test", "")
                task_id = self.next_id(CATEGORY_E2E_HEALTH)
                task = TestTask(
                    id=task_id,
                    name=f"E2E: Health - {test_name}",
                    category=CATEGORY_E2E_HEALTH,
                    command=f"npm test -- tests/e2e/health/{test_file.name}",
                    accept=f"npm test -- tests/e2e/health/{test_file.name}",
                    scope=["tests/e2e/health"],
                    timeout=30,
                    fast=True,
                    description=f"Service health check: {test_name}",
                    tags=["e2e", "health", "service"],
                )
                self.tasks.append(task)
                self.e2e_tests.append(task)
        
        # Security tests
        sec_dir = e2e_dir / "security"
        if sec_dir.exists():
            sec_tests = list(sec_dir.glob("*.test.js"))
            for test_file in sec_tests:
                test_name = test_file.stem.replace(".test", "")
                task_id = self.next_id(CATEGORY_E2E_SECURITY)
                task = TestTask(
                    id=task_id,
                    name=f"E2E: Security - {test_name}",
                    category=CATEGORY_E2E_SECURITY,
                    command=f"npm test -- tests/e2e/security/{test_file.name}",
                    accept=f"npm test -- tests/e2e/security/{test_file.name}",
                    scope=["tests/e2e/security"],
                    timeout=45,
                    fast=False,
                    description=f"Security validation: {test_name}",
                    tags=["e2e", "security", "validation"],
                )
                self.tasks.append(task)
                self.e2e_tests.append(task)
        
        # UI tests (Playwright)
        documents_dir = e2e_dir / "documents"
        if documents_dir.exists():
            ui_tests = list(documents_dir.glob("*.spec.js"))
            for test_file in ui_tests:
                test_name = test_file.stem.replace(".spec", "")
                task_id = self.next_id(CATEGORY_E2E_UI)
                task = TestTask(
                    id=task_id,
                    name=f"E2E: UI - {test_name}",
                    category=CATEGORY_E2E_UI,
                    command=f"npx playwright test tests/e2e/documents/{test_file.name}",
                    accept=f"npx playwright test tests/e2e/documents/{test_file.name}",
                    scope=["tests/e2e/documents"],
                    timeout=90,
                    fast=False,
                    description=f"UI test with Playwright: {test_name}",
                    tags=["e2e", "ui", "playwright"],
                )
                self.tasks.append(task)
                self.e2e_tests.append(task)

    # -------------------------------------------------------------------------
    # Conformance Tests
    # -------------------------------------------------------------------------

    def generate_conformance_tasks(self):
        """Generate conformance testing tasks."""
        conv_crate = self.repo_dir / "core" / "crates" / "wo-conformance"
        
        if not conv_crate.exists():
            return
        
        corpus_dir = conv_crate / "corpus" / "cases"
        if corpus_dir.exists():
            cases = list(corpus_dir.glob("*.docx"))
            
            # Full pipeline task
            task_id = self.next_id(CATEGORY_CONFORMANCE)
            task = TestTask(
                id=task_id,
                name="Conformance: Full pipeline",
                category=CATEGORY_CONFORMANCE,
                command="cd core/crates/wo-conformance && ./scripts/run-pipeline.sh --threshold 0.95",
                accept="cd core/crates/wo-conformance && ./scripts/run-pipeline.sh --threshold 0.95",
                scope=["core/crates/wo-conformance"],
                timeout=300,  # 5 minutes
                fast=False,
                description="Run full conformance pipeline with 95% threshold",
                tags=["conformance", "pipeline", "rendering"],
            )
            self.tasks.append(task)
            self.conformance_tests.append(task)
            
            # Individual case tasks
            for case_file in cases:
                case_name = case_file.stem
                task_id = self.next_id(CATEGORY_CONFORMANCE)
                task = TestTask(
                    id=task_id,
                    name=f"Conformance: {case_name}",
                    category=CATEGORY_CONFORMANCE,
                    command=f"cd core/crates/wo-conformance && ./scripts/capture-truth.py capture corpus --case {case_name} --force",
                    accept=f"cd core/crates/wo-conformance && ./scripts/capture-truth.py compare corpus --case {case_name} --threshold 0.95",
                    scope=["core/crates/wo-conformance/corpus/cases"],
                    timeout=120,
                    fast=False,
                    deps=[task.id],  # Depend on full pipeline
                    description=f"Conformance test for case: {case_name}",
                    tags=["conformance", "case", case_name],
                )
                self.tasks.append(task)
                self.conformance_tests.append(task)

    # -------------------------------------------------------------------------
    # Mutation Tests
    # -------------------------------------------------------------------------

    def generate_mutation_tasks(self):
        """Generate mutation testing tasks."""
        # Mutation test for each major crate
        crates_for_mutation = [
            "wo-common", "wo-docx", "wo-renderer", "wo-docserver",
            "wo-ooxml", "wo-html", "wo-txt", "wo-pdf"
        ]
        
        for crate_name in crates_for_mutation:
            task_id = self.next_id(CATEGORY_MUTATION)
            task = TestTask(
                id=task_id,
                name=f"Mutation: {crate_name}",
                category=CATEGORY_MUTATION,
                command=f"cargo mutants run --package {crate_name} --timeout 300",
                accept=f"cargo mutants results --package {crate_name} --threshold 80",
                scope=[f"core/crates/{crate_name}"],
                timeout=600,  # 10 minutes
                fast=False,
                description=f"Mutation testing for {crate_name} with 80% threshold",
                tags=["mutation", crate_name, "quality"],
            )
            self.tasks.append(task)
            self.mutation_tests.append(task)

    # -------------------------------------------------------------------------
    # Visual Regression Tests
    # -------------------------------------------------------------------------

    def generate_visual_tasks(self):
        """Generate visual regression testing tasks."""
        # Sample documents to test
        sample_docs = [
            "simple.docx", "formatted.docx", "tables.docx",
            "images.docx", "headings.docx"
        ]
        
        for doc in sample_docs:
            task_id = self.next_id(CATEGORY_VISUAL)
            task = TestTask(
                id=task_id,
                name=f"Visual: {doc}",
                category=CATEGORY_VISUAL,
                command=f"bash scripts/tf-test-harness/scripts/visual-regression.sh --document tests/sample-docs/{doc}",
                accept=f"bash scripts/tf-test-harness/scripts/visual-regression.sh --document tests/sample-docs/{doc} --threshold 0.99",
                scope=["scripts/tf-test-harness/scripts/visual-regression.sh"],
                timeout=120,
                fast=False,
                description=f"Visual regression test for {doc}",
                tags=["visual", "regression", doc],
            )
            self.tasks.append(task)
            self.visual_tests.append(task)

    # -------------------------------------------------------------------------
    # Agent Evaluation Tests
    # -------------------------------------------------------------------------

    def generate_agent_tasks(self):
        """Generate agent evaluation tasks."""
        agent_tests = [
            ("Document integrity after agent edits", 
             "python3 scripts/tf-test-harness/scripts/agent-eval.py --test integrity"),
            ("Agent edit sequence validation", 
             "python3 scripts/tf-test-harness/scripts/agent-eval.py --test sequence"),
            ("Property-based agent testing", 
             "python3 scripts/tf-test-harness/scripts/agent-eval.py --test property"),
            ("mutation score for agent surface", 
             "python3 scripts/tf-test-harness/scripts/agent-eval.py --test mutation --threshold 100"),
        ]
        
        for name, command in agent_tests:
            task_id = self.next_id(CATEGORY_AGENT)
            task = TestTask(
                id=task_id,
                name=f"Agent: {name}",
                category=CATEGORY_AGENT,
                command=command,
                accept=command,
                scope=["scripts/tf-test-harness/scripts/agent-eval.py"],
                timeout=180,
                fast=False,
                description=name,
                tags=["agent", "evaluation", "validation"],
            )
            self.tasks.append(task)
            self.agent_tests.append(task)

    # -------------------------------------------------------------------------
    # Performance Tests
    # -------------------------------------------------------------------------

    def generate_performance_tasks(self):
        """Generate performance and load testing tasks."""
        perf_tests = [
            ("Load test: 100 concurrent users",
             "bash scripts/tf-test-harness/scripts/load-test.sh --users 100 --duration 60",
             90, False),
            ("Load test: 500 concurrent users", 
             "bash scripts/tf-test-harness/scripts/load-test.sh --users 500 --duration 120",
             180, False),
            ("Stress test: document operations",
             "bash scripts/tf-test-harness/scripts/stress-test.sh --ops 10000 --concurrent 50",
             300, False),
            ("Benchmark: renderer",
             "cargo bench -p wo-renderer --bench render",
             120, False),
            ("Benchmark: docx parser",
             "cargo bench -p wo-docx --bench parse",
             120, False),
        ]
        
        for name, command, timeout, fast in perf_tests:
            task_id = self.next_id(CATEGORY_PERFORMANCE)
            task = TestTask(
                id=task_id,
                name=f"Performance: {name}",
                category=CATEGORY_PERFORMANCE,
                command=command,
                accept=command,
                scope=[] if "cargo bench" in command else ["scripts/tf-test-harness/scripts/"],
                timeout=timeout,
                fast=fast,
                description=name,
                tags=["performance", "benchmark", "load"],
            )
            self.tasks.append(task)
            self.performance_tests.append(task)

    # -------------------------------------------------------------------------
    # Coverage Task
    # -------------------------------------------------------------------------

    def generate_coverage_task(self):
        """Generate coverage reporting task."""
        task_id = self.next_id(CATEGORY_COVERAGE)
        task = TestTask(
            id=task_id,
            name="Coverage: Full workspace",
            category=CATEGORY_COVERAGE,
            command="cargo llvm-cov --workspace --output-dir coverage --lcov",
            accept="cargo llvm-cov --workspace --output-dir coverage --lcov --threshold 70",
            scope=["coverage/"],
            timeout=300,
            fast=False,
            description="Generate code coverage report for entire workspace with 70% threshold",
            tags=["coverage", "reporting"],
        )
        self.tasks.append(task)
        self.coverage_tasks.append(task)

    # -------------------------------------------------------------------------
    # Harness Graph Integration
    # -----------------------------------------------------------------------------

    def add_harness_graph_features(self):
        """Add harness graph feature IDs to tasks."""
        features_file = self.repo_dir / "scripts" / "harness-graph" / "features.yaml"
        
        if not features_file.exists():
            return
        
        # This is a simplified version - in practice, we'd parse YAML
        # and map features to tasks based on file scope
        common_features = [
            "F-001", "F-002", "F-003", "F-004", "F-005",
            "F-010", "F-011", "F-012", "F-013", "F-014"
        ]
        
        # Add features to relevant tasks
        for task in self.tasks:
            if task.category.startswith("e2e:wopi"):
                task.features.extend(["F-001", "F-002", "F-003"])
            elif task.category.startswith("e2e:health"):
                task.features.extend(["F-004", "F-005"])
            elif task.category.startswith("e2e:sec"):
                task.features.extend(["F-010", "F-011"])
            elif task.category.startswith("conv"):
                task.features.extend(["F-050", "F-051", "F-052"])
            elif task.category.startswith("rust"):
                task.features.extend(["F-020", "F-021"])

    # -----------------------------------------------------------------------------
    # Generation
    # -----------------------------------------------------------------------------

    def generate_all(self):
        """Generate all test tasks."""
        self.task_counter = {}
        self.tasks = []
        self.crate_tests = {}
        self.e2e_tests = []
        
        # Generate tasks
        self.generate_rust_tasks()
        self.discover_e2e_tests()
        self.generate_conformance_tasks()
        self.generate_mutation_tasks()
        self.generate_visual_tasks()
        self.generate_agent_tasks()
        self.generate_performance_tasks()
        self.generate_coverage_task()
        
        # Add metadata
        self.add_harness_graph_features()
        
        # Sort by category and name
        category_order = [
            CATEGORY_RUST,
            CATEGORY_RUST_INT,
            CATEGORY_E2E,
            CATEGORY_E2E_HEALTH,
            CATEGORY_E2E_WOPI,
            CATEGORY_E2E_SECURITY,
            CATEGORY_E2E_UI,
            CATEGORY_CONFORMANCE,
            CATEGORY_MUTATION,
            CATEGORY_VISUAL,
            CATEGORY_AGENT,
            CATEGORY_PERFORMANCE,
            CATEGORY_COVERAGE,
        ]
        
        def category_key(task):
            try:
                return category_order.index(task.category)
            except ValueError:
                return len(category_order)
        
        self.tasks.sort(key=lambda t: (category_key(t), t.name))
        
        return self.tasks

    def to_json(self) -> Dict:
        """Convert all tasks to JSON format."""
        tasks_dict = {task.id: task.to_dict() for task in self.tasks}
        
        return {
            "_meta": {
                "source": "scripts/tf-test-harness/scripts/generate-tests.py",
                "description": "Generated test tasks for World-Office",
                "task_count": len(self.tasks),
                "generated_at": "",  # Will be filled at write time
                "categories": {
                    CATEGORY_RUST: len([t for t in self.tasks if t.category == CATEGORY_RUST]),
                    CATEGORY_RUST_INT: len([t for t in self.tasks if t.category == CATEGORY_RUST_INT]),
                    CATEGORY_E2E: len([t for t in self.tasks if t.category.startswith(CATEGORY_E2E)]),
                    CATEGORY_CONFORMANCE: len([t for t in self.tasks if t.category == CATEGORY_CONFORMANCE]),
                    CATEGORY_MUTATION: len([t for t in self.tasks if t.category == CATEGORY_MUTATION]),
                    CATEGORY_VISUAL: len([t for t in self.tasks if t.category == CATEGORY_VISUAL]),
                    CATEGORY_AGENT: len([t for t in self.tasks if t.category == CATEGORY_AGENT]),
                    CATEGORY_PERFORMANCE: len([t for t in self.tasks if t.category == CATEGORY_PERFORMANCE]),
                    CATEGORY_COVERAGE: len([t for t in self.tasks if t.category == CATEGORY_COVERAGE]),
                },
            },
            "tasks": tasks_dict,
        }


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate TaskFleet test tasks from World-Office source code"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output file (default: {DEFAULT_OUTPUT})"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate existing tasks.json"
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Show generation summary"
    )
    parser.add_argument(
        "--from-harness-graph",
        action="store_true",
        help="Include harness graph features in task generation"
    )
    parser.add_argument(
        "--fast-only",
        action="store_true",
        help="Only include fast tests (< 30s)"
    )
    
    args = parser.parse_args()
    
    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    if args.check:
        # Validate existing tasks.json
        if not output_path.exists():
            print(f"Error: {output_path} does not exist")
            sys.exit(1)
        
        with open(output_path, "r") as f:
            data = json.load(f)
        
        tasks = data.get("tasks", {})
        errors = []
        
        for task_id, task_data in tasks.items():
            if not isinstance(task_data, dict):
                errors.append(f"{task_id}: not a dict")
                continue
            if "id" not in task_data:
                errors.append(f"{task_id}: missing 'id' field")
            if "command" not in task_data:
                errors.append(f"{task_id}: missing 'command' field")
            if "accept" not in task_data:
                errors.append(f"{task_id}: missing 'accept' field")
            if "category" not in task_data:
                errors.append(f"{task_id}: missing 'category' field")
        
        if errors:
            print("Validation errors:")
            for error in errors[:10]:  # Limit to first 10
                print(f"  - {error}")
            if len(errors) > 10:
                print(f"  ... and {len(errors) - 10} more")
            sys.exit(1)
        else:
            print(f"✓ {len(tasks)} tasks validated successfully")
            sys.exit(0)
    
    # Generate new tasks
    generator = TestGenerator(
        repo_dir=REPO_DIR,
        include_slow=not args.fast_only
    )
    
    tasks = generator.generate_all()
    
    if args.fast_only:
        tasks = [t for t in tasks if t.fast]
    
    result = generator.to_json()
    result["_meta"]["generated_at"] = ""
    
    # Write output
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    
    result["_meta"]["generated_at"] = ""
    
    if args.summary:
        print("")
        print("=" * 60)
        print("Test Task Generation Summary")
        print("=" * 60)
        print(f"Total tasks: {len(tasks)}")
        print(f"Output: {output_path}")
        print("")
        print("By category:")
        categories = {}
        for task in tasks:
            cat = task.category
            categories[cat] = categories.get(cat, 0) + 1
        for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
            print(f"  {cat:20s}: {count} tasks")
        print("")
        
        fast_count = sum(1 for t in tasks if t.fast)
        slow_count = len(tasks) - fast_count
        print(f"Fast tests (< 30s): {fast_count}")
        print(f"Slow tests (>= 30s): {slow_count}")
        print("")
        
        print("Sample tasks:")
        for task in tasks[:10]:
            print(f"  {task.id}: {task.name} [{task.category}]")
        if len(tasks) > 10:
            print(f"  ... and {len(tasks) - 10} more")
        print("")
    else:
        print(f"Generated {len(tasks)} test tasks to {output_path}")


if __name__ == "__main__":
    main()
