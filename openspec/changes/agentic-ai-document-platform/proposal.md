## Why

Microsoft's Copilot agentic capabilities became generally available on 2026-04-22, making
multi-step, app-native AI editing the default in Word/Excel/PowerPoint — with control,
transparency, and context-grounding as first-class requirements. World-Office is an open,
self-hostable WOPI docserver + collaborative editor whose op-based CRDT, WOPI locks,
versioning, and presence already *are* the control plane an agent needs. We should turn
that into an open, model-agnostic agentic document platform, and run our own engineering as
a spec-driven, continuously-evaluated agent loop.

## What Changes

- Expose document operations (read/write bytes, apply ops, lock, versions, presence) as a
  **model-agnostic agent tool surface** (MCP).
- Make AI agents **first-class collaboration clients**: their edits flow through the same
  `apply_ops` pipeline, so they are observable, attributable, and revertible.
- Add an **"AI changes" review** experience: diff the op stream and accept/reject per op or
  per revision.
- Extend the existing **property/fuzz/mutation test suites** with agent-output corpora so
  agent edits are regression-tested against document-integrity invariants.
- Keep the model layer **pluggable** (any vendor or local model; no hard lock-in).

## Capabilities

### New Capabilities
- `agent-tool-surface`: model-agnostic MCP server exposing document operations as agent tools.
- `agent-collab-client`: AI agents join the collaboration hub as clients; edits are op-based,
  observable, attributable, revertible, and reviewable.
- `agent-eval-harness`: agent-generated edits are covered by the property/fuzz/mutation
  evaluation suites, with mutation score as a merge gate.

### Modified Capabilities
<!-- No existing requirement changes; this is net-new. -->

## Impact

- `opencloud-docserver`: new `ai/` package (MCP server, agent-session adapter), collaboration
  hub gains an agent client role, editor UI gains a review panel.
- Reuses existing `DocumentStore`, `CollabHub`, WOPI router, and DOCX/ODT converters.
- New dependency: an MCP SDK (model-agnostic transport) — selected during implementation,
  no vendor lock-in.
- Engineering workflow: OpenSpec-driven changes + mutation score as a standing merge gate.
