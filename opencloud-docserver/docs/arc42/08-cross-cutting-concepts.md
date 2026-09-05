# 08 — Cross-cutting Concepts

## CRDT op pipeline (the one write path)

Every write — browser keystroke, paste, agent `apply_ops` — becomes CRDT wire ops and flows through
`CollabHub.apply_ops`: **dedup** by `(site, seq)` op key → **Lamport validation** → log append →
presence/SSE fan-out. There is no privileged writer. Agents additionally get:
index compilation (`compile_text_edit`: visible-index edits → wire ops using the *global* clock so
indices are exact at apply time), the `agent=` site prefix (attribution travels in the op stream),
and budgets (≤200 ops/call, ≤25 steps/run).

## Lock parity (WOPI as the only lock plane)

`lock`/`unlock`/`refresh`/`get` semantics are identical for humans and agents, including the
409 lock-mismatch contract that echoes the current token. `tests/test_ai_lock_parity.py` proves
agent-vs-human and human-vs-agent symmetry. Autosave PutFile carries `X-WOPI-Lock`; the cloud's
own locks are honored, never bypassed.

## Typed error contract

Tools and API endpoints return `{"ok": false, "error": code, "status": http_status, …}` with a
small code vocabulary: `bad_request` (400), `not_found` (404), `lock_mismatch` (409), plus domain
codes (`agents_disabled`, `unknown_tool`…). Malformed input never raises into the framework;
hostile input is fuzz-tested (`test_api_fuzz.py`, `test_ai_mcp_fuzz.py`, sanitizer adversarial).

## Determinism & goldens

- `get_context` pack: pure function of document state → golden test.
- MCP catalog (`TOOL_CATALOG`, version `1.1`): golden JSON — drift is a review event.
- Snapshot goldens for converter output; recapture-as-PR, never silent.

## Honesty rules (register)

A feature exists iff a tagged test proves it (or a `divergence` entry documents why not).
The seed script projects `features.yaml` + collected `test_*` functions into `graph.json`
(`--check` = drift gate); `check-register.py F-…` fails unless every id is covered or
divergence-documented. This runs in CI on every docserver PR.

## Privacy & egress

The docserver process makes **no outbound model calls**. Provider adapters translate responses the
*caller* fetched. A fully local deployment (local model, disabled egress) is a supported shape —
E19S2 tests run with network access severed.

## Observability

`/health` (liveness + doc count), structured logs, op log as audit trail, `AgentReport`
(steps/ops/rev/transcript/stopped_reason) + per-model token usage for cost accounting.
