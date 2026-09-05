# 01 — Introduction & Goals

## What the system is

`opencloud-docserver` is the World-Office product: **one Python (FastAPI) service** that a file cloud
(OpenCloud, Nextcloud) opens documents in over the **WOPI** protocol. It serves the editor UI, keeps
concurrent editors consistent through a CRDT collaboration hub, converts DOCX/ODT to and from the
editor's HTML model, exports to PDF/ODT/DOCX/HTML, and exposes a **model-agnostic agent surface**
(MCP) so AI agents can read and edit documents as first-class collaboration clients.

## Four jobs (the whole backlog must trace to one of these)

1. **Open** — a user clicks a document in their cloud; the docserver answers WOPI
   (check-file-info, lock, get/put file) and serves the editor at `/app`.
2. **Edit together** — multiple browsers (and agents) edit one document; ops flow through the hub,
   conflict-free; autosave persists bytes back to the cloud via WOPI put-file.
3. **Convert & export** — DOCX/ODT ⇄ HTML projection; PDF export with a real engine (WeasyPrint);
   downloads are byte-verbatim round-trips.
4. **Agent in the loop** — an agent connects over MCP, gets a versioned tool catalog
   (`get_context`, `read_doc`, `apply_ops`, `get_versions`, `lock`, `presence`), and its edits land
   in the same op stream as human edits — attributable, lock-respecting, budget-bounded, reviewable.

## Quality goals (top 3)

| Goal | Scenario | Metric |
|------|----------|--------|
| Correctness you can verify | Round-trips, WOPI conformance, register honesty | 1,476 tests green; register 82/82 covered-or-divergence-documented |
| Cloud integration that doesn't lie | `/app/open` on the live stack | WOPI contract tests + live E2E on cloud.graphwiz.ai |
| Agents that behave | Agent edits under budgets/locks | lock-parity tests, provider differential tests, review op-stream |

## Stakeholders

- **End users** — edit ODT/DOCX in their cloud, alone or together.
- **Cloud operators** — deploy one container next to OpenCloud; no new state plane beyond SQLite + files.
- **Agent owners** — any MCP-speaking framework; no vendor SDK required on either side.
- **Developers/maintainers** — a repo small enough to hold in one head; tests as the spec.
