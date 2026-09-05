# 04 — Solution Strategy

The design answers the quality goals with a handful of load-bearing decisions. Each maps to a
Stoic check from `plan/RETHINK_WORLD_OFFICE.md`: *does this reduce the surface while increasing
verifiable value?*

| Decision | Quality goal | Mechanism |
|----------|--------------|-----------|
| **One service, four modules** | maintainability | `editor/` (collab+convert), `wopi/`, `ai/`, `lib/store.py`. No microservices; no message bus. |
| **Agents are collaboration clients** | behavioral safety, fairness | Agent edits enter the *same* `CollabHub.apply_ops` pipeline as browsers: same CRDT, same lock 409s, same op log. No parallel write path exists. |
| **Loud failure over silent stub** | trustworthiness | Missing export engine = 500, never a placeholder PDF; success carries `X-Export-Engine`. |
| **Honest register** | verifiability | Every product feature is F-tagged; a feature is "covered" only by a tagged passing test, else it carries a `divergence` note. CI fails on drift or dishonesty (`check-register.py` all-82). |
| **Determinism where agents look** | grounding quality | `get_context` is a pure function of document state (golden-tested); adapters are pure translators (differential-tested). |
| **No model egress in-process** | privacy | Provider transports are injected callables; on-prem deployments can run fully local models with zero outbound connections from the docserver. |
| **Tests as the spec** | regression safety | 1,476 tests: contract, property/fuzz, model-based collab, lock parity, WOPI protocol property, export contracts, goldens. |

## Tactics

- **Conflict resolution:** server-side TextCRDT (Lamport clocks, per-site ids); agents allocate
  sequence numbers from the *global* clock so their index semantics match browser editors exactly.
- **Runaway protection:** op budget (≤200/call) + step budget (≤25/turn) in `AgentRunner`; budgets
  are the anti-flood guard, not per-user quotas.
- **Typed errors everywhere:** tools return `{"ok": false, "error": <code>, "status": <int>}` —
  never exceptions across the tool boundary; the MCP layer maps them to `isError` results.
- **Rollback paths:** `DOCSERVER_AGENTS=0` disables the agent surface without touching human
  editing; each capability is additive.
