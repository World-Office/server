# 09 — Architecture Decisions (ADR log)

| # | Decision | Status | Rationale / consequences |
|---|----------|--------|--------------------------|
| 1 | **One Python service replaces the Rust cathedral** | accepted 2026-08 | RETHINK: product surface = WOPI docserver + editor + AI. 62k files → one deployable. Rust stack kept as reference + conformance oracle. |
| 2 | **SQLite + content dir as the store** | accepted | No DB server to operate; versions are byte snapshots with pruned retention; locks are rows. Limit: single node. |
| 3 | **TextCRDT in-process hub (CollabHub)** | accepted | Real-time co-editing without a collab service. Memory = live docs only; persistence via snapshots. |
| 4 | **WOPI as the only integration contract** | accepted | OpenCloud/Nextcloud speak it natively; discovery XML + lock semantics tested byte-exact. |
| 5 | **HTML as the editor model; DOCX/ODT as projections** | accepted | One editing surface; converters are the (tested) boundary. Fidelity risk concentrated where tests can see it. |
| 6 | **WeasyPrint for PDF, loud on missing engine** | accepted (replaced stub) | Real structural PDFs (`%PDF`, xref); `X-Export-Engine` header; stub fallback removed — a lie in an export is worse than an error. |
| 7 | **Agents are collaboration clients, not a new primitive** | accepted | One write path, one lock plane, attribution via `agent=` site ids. Kill switch: `DOCSERVER_AGENTS=0`. |
| 8 | **MCP over stdio, hand-rolled JSON-RPC (~200 lines)** | accepted | No SDK dependency; pure handler object → exhaustive fuzz tests; NDJSON transport trivially embeddable. |
| 9 | **Model-agnostic runner; providers as injected transports** | accepted (E19) | `model(messages) -> calls` contract; vendor dialects translated in `ai/adapters.py`; differential-tested; no egress in-process. |
| 10 | **Feature register as a CI gate** | accepted | `features.yaml` (82 F-ids) + graph projection + `check-register.py`: coverage claims must be true in every PR. |
| 11 | **Goldens recapture via PR only** | accepted | Catalog/converter/snapshot goldens change visibly in review; never auto-regenerated in deploy paths. |
| 12 | **Fonts in the image are a correctness concern** | accepted | `fonts-dejavu-core` mandatory: slim base ships no fonts → blank glyphs in PDFs. |

## Superseded

- *Stub PDF export* (pre-2026-09) → superseded by decision 6.
- *opencloud.yaml `app_registry` mimetypes block* → the live mechanism is the collaboration service's
  gRPC registration + `/etc/opencloud/app-registry.yaml` (with `default_app` for ODT). The yaml block
  is an inert duplicate kept for safety; do not "clean it up" without an A/B test on staging.
