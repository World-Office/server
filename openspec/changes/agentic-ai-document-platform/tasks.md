## 1. Agent tool surface (MCP)

- [ ] 1.1 Scaffold `opencloud-docserver/ai` package and an MCP server (stdio transport to start)
- [ ] 1.2 Map `read_doc` / `get_versions` / `lock` / `presence` tools onto the existing `DocumentStore` and WOPI router APIs
- [ ] 1.3 Map `apply_ops` onto the collaboration hub and enforce the `409` lock-mismatch contract for locked docs
- [ ] 1.4 Define model-agnostic tool schemas (no vendor-specific fields); document the tool catalog

## 2. Agent collaboration client

- [ ] 2.1 Add an agent client role and agent-tagged `client_id` in the collaboration hub
- [ ] 2.2 Route agent edits through `apply_ops`; reuse presence, versioning, and undo
- [ ] 2.3 Reuse existing guards so malformed/corrupt agent input is rejected without crashing the hub
- [ ] 2.4 Add a thin `AgentRunner` adapter translating model tool calls into ops (pluggable model)

## 3. Review experience

- [ ] 3.1 Editor UI: render the op-stream diff between the pre-agent and post-agent revisions
- [ ] 3.2 Accept/reject per op and per revision; rollback to any prior version
- [ ] 3.3 Surface agent attribution (agent-tagged `client_id`) in the review pane

## 4. Evaluation harness

- [ ] 4.1 Add agent-output corpora as inputs to the property and fuzz suites (document-integrity invariants)
- [ ] 4.2 Add mutation mutants for the agent tool surface and collaboration path
- [ ] 4.3 Wire the mutation score (100%) as a merge gate in CI

## 5. Engineering workflow

- [ ] 5.1 Document the OpenSpec-driven + eval-gated agent dev loop in `AGENTS.md` / `plan/`
- [ ] 5.2 Capture the agentic-AI direction as a planning doc under `plan/`
