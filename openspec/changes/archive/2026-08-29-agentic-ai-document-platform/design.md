## Context

`opencloud-docserver` already implements a WOPI host (CheckFileInfo/GetFile/PutFile/Lock),
an op-based `TextCRDT` collaboration hub with presence and versions, and tolerant DOCX/ODT
converters. An agent needs exactly three things the server already has: (1) a way to read and
act on documents, (2) a guarantee its actions are safe and reviewable, and (3) grounding
context. The cleanest design reuses these primitives instead of adding a parallel "AI" code
path that would bypass the existing safety model.

## Goals / Non-Goals

**Goals:**
- Provide a model-agnostic tool surface so any LLM (Claude, GPT, Copilot, local) can edit
  World-Office documents.
- Guarantee agent edits are bounded by the same op/lock/version control plane as human edits
  (no privileged path).
- Make agent changes transparent and reversible by construction (op stream).
- Prove agent safety via the existing evaluation harness.

**Non-Goals:**
- Building or fine-tuning our own frontier model.
- Document authoring *quality* (that is the model's job; we provide the safe substrate).
- Replacing human editing — agents are collaborators, not owners.

## Decisions

- **Tool surface = MCP** (Model Context Protocol) over the existing WOPI + collab APIs.
  Rationale: MCP is the emerging interoperable standard; any agent framework can call us
  without custom adapters. Alternative (ad-hoc REST + per-vendor SDKs) rejected: vendor
  lock-in and N bespoke adapters.
- **Agent = collaboration client, not a new primitive.** The agent opens a doc like any
  editor, calls `apply_ops`, and its `client_id` is tagged `agent=<...>`. Rationale: inherits
  presence, locking, versioning, undo, and the control plane for free; ops are already the
  unit of review/diff. Alternative (a separate "AI write" endpoint) rejected: it would bypass
  the safety/observability model.
- **Review = op-stream diff.** The "AI changes" UI renders the delta between the pre-agent and
  post-agent revisions as ops; accept/reject per op or per revision. Rationale: ops are the
  natural, granular, revertible unit; no new data model needed.
- **Model-agnostic by default.** The server is model-agnostic; a thin `AgentRunner` adapter
  translates a model's tool calls into our ops. No hardcoded vendor.
- **Eval = extend existing suites.** Agent-output corpora become new inputs to the
  property/fuzz/mutation suites already built; mutation score stays the gate. Rationale: reuses
  investment, and agent edits are just another untrusted input class.

## Risks / Trade-offs

- [Agent emits malformed/garbage ops] → existing collab hardening rejects malformed ops; the
  hub never crashes; review gate catches the rest.
- [Agent writes corrupt/hostile bytes] → tolerant converters + "never 500" contract +
  content-suppression sanitizer.
- [Agent races on a doc] → store RLock + WOPI lock semantics.
- [Hallucinated/destructive edits slip through review] → per-op/per-revision accept/reject +
  version history.
- [Cost/latency of multi-step agent loops] → bound op counts, stream progress via presence,
  keep model pluggable.
- [Eval debt] → mutation score 100% as a standing gate; agent corpora added to it.

## Migration Plan

Incremental and additive: the tool surface and agent-collab-client add no breaking changes to
existing APIs. The review UI is a new editor panel. Roll back by disabling the `ai` package;
existing human editing is unaffected.

## Open Questions

- Which MCP transport (stdio vs HTTP/SSE) for self-hosted deployments?
- Default agent permission model per deployment (read-only vs edit)?
