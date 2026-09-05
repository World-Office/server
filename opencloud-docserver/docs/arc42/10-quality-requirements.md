# 10 — Quality Requirements

## Quality model (top scenarios → current state)

| Quality | Scenario | Measure | State |
|---------|----------|---------|-------|
| **Functional correctness** | DOCX/ODT ⇄ HTML ⇄ bytes round-trips | converter differential + property + golden tests | ✅ suite green |
| **Protocol conformance** | WOPI discovery/locks/files vs OpenCloud | WOPI protocol property + live E2E on cloud.graphwiz.ai | ✅ live verified |
| **Collaboration consistency** | N clients + agents, concurrent ops | model-based collab tests (random interleavings, model checking) | ✅ |
| **AI behavioral safety** | agent floods/locks/overwrites | lock parity, budgets, review stream, permission + failure-injection suites | ✅ |
| **Provider independence** | same plan, two vendors → same doc | differential test (E19S1) | ✅ |
| **Grounding quality** | agent edits respect document intent | deterministic `get_context` pack (E18S1), golden-tested | ✅ |
| **Verifiability (register)** | every feature honestly claimed | 82/82 covered-or-divergence-documented; CI gate | ✅ |
| **Fidelity (oracle)** | our render vs LibreOffice/OnlyOffice truth | wo-conformance scoring, 30 goldens, divergence register | 🔶 monitored, 2 known divergences (font substitution, space-at-font-boundary) |

## Test suite (the spec)

~1,476 tests in `tests/`: contract suites per module, property/fuzz (Hypothesis) for APIs, WOPI
protocol, sanitizer adversarial, model-based collab, lock parity, AI tool surface (edge, fuzz,
permissions, runner bounds, provider fail, review control, MCP catalog + goldens), export contracts,
persistence, resilience. Plus Playwright GUI E2E (`e2e/`, `@gui` marked) against the live stack.

Run: `uv run --frozen pytest tests/ -q` — CI enforces it on every docserver PR together with the
graph drift gate and the all-82 register gate.
