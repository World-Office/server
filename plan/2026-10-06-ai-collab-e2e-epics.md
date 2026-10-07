# Epics & User Stories — AI-assisted editing, collaboration, parity e2e

**Date:** 2026-10-06
**Status:** backlog — execution via agentflow (af) + the e2e layer
(`server/tests/e2e/tests/documents/*.spec.ts`), gated by the parity stack
(`reconcile.py --check --seed-check --interactions --fx --geometry --visual --ai`).

Each epic maps to user stories (`us-` ids) with acceptance criteria and the
e2e spec that proves it. The AI epic closes the register's declared gap
(F-148..F-153 "loud, not silent") with the editor-side surfaces that were
waiting on the rust gateway.

---

## E-AI-1 · AI-assisted editing (F-148..F-152 e2e layer)

**Goal:** the AI tab is a first-class editing surface: propose, review,
reject, and generate — all against the rust docserver gateway
(`/ai/config`, `/api/ai/tools`, `/ai/generate`,
`/api/documents/{id}/ai/propose|review|review/reject`).

**User stories**

| id | as a … | I want to … | so that … | acceptance (e2e) |
|---|---|---|---|---|
| us-ai-1 | writer | ask the AI to propose an edit ("Summarize…", "Fix grammar…") | I get a concrete, attributed change I can accept or reject | `ai-assist.spec.ts`: propose dialog opens, runs, closes with status; op appears in review |
| us-ai-2 | writer | review all AI changes in one list | I can decide per-change instead of trust blindly | review dialog lists `#rev · AI (model) · summary` rows |
| us-ai-3 | writer | reject one or all AI changes | a wrong suggestion never lands | reject returns ok and the op leaves the list (server store shrinks) |
| us-ai-4 | reviewer | see who made every change | I can tell human edits from model edits | review rows carry `AI (model)` author attribution |
| us-ai-5 | power user | generate a document from a prompt | I don't start from a blank page | `/ai/generate` returns markdown; the converter chain stays pinned (F-152b) |
| us-ai-6 | integrator | discover what the editor can do as tools | an inline agent can drive the ribbon | `/api/ai/tools` returns JSON-schema tools (name/description/parameters) |
| us-ai-7 | operator | know the AI provider is configured | misconfiguration fails loudly, not silently | `/ai/config` exposes base url/model/key_set |

**Out of scope:** in-browser LLM (F-153 — deferred by design, spec-only).

---

## E-CO-1 · Real-time collaboration e2e

**Goal:** two editors, one document — model ops converge, cursors and
presence are visible, no clobbering.

**Status (2026-10-06):** ✅ wire substrate proven + spec added. The engine
mismatch that silently dropped document ops was fixed: `useCanvasCollaboration`
now speaks the flattened WIRE_SCHEMA_VERSION=1 envelope (was nested `payload`,
which the coauthoring service's serde rejected). Live two-client check verified
A's insert reaches B (`coauth-sync-check.cjs`); 31 hook tests pass;
`collaboration.spec.ts` added; the coauthoring service joined the e2e stack
(`tests/docker-compose.test.yml`).

**User stories**

| id | as a … | I want to … | so that … | acceptance |
|---|---|---|---|---|
| us-co-1 | co-author | see the other person's cursor move | we don't collide | coauthor wire: cursor events render remote cursors live |
| us-co-2 | co-author | my edits appear on their screen within seconds | the session feels live | remote ModelOp applies via `apply_op` (CanvasEditor.applyOp path) |
| us-co-3 | co-author | accept/reject AI changes without breaking the session | AI + humans coexist | AI op rejected on one client converges on the other |
| us-co-4 | session admin | recover after a disconnect | nobody loses work | ephemeral connections reconnect and re-sync the op envelope |

**Acceptance (e2e):** two-browser spec (chromium contexts), same doc id,
type in A → B renders; reject AI op in A → B's list syncs.

---

## E-FP-1 · Formatting parity — the ribbon toolbar tour

**Goal:** every visible ribbon command works end to end (no dead buttons),
proven by clicking through the whole Home tab.

**User stories**

| id | as a … | I want to … | so that … | acceptance |
|---|---|---|---|---|
| us-fp-1 | editor user | bold/italic/underline/align/heading on a selection | formatting actually renders | toolbar tour clicks each control; `aria-pressed` reflects state; console stays clean |
| us-fp-2 | editor user | the font dropdown to apply a family | text changes face | select.value changes → computed font-family changes |
| us-fp-3 | integrator | no silent stubs | broken buttons are loud | fx census: 0 silent / 0 unclickable (already gated) |

**Acceptance (e2e):** `toolbar-tour.spec.ts` iterates the Home-tab buttons
(`#toolbar [data-tab="home"] button`), clicks each, asserts no page errors
and no console errors.

---

## E-FI-1 · Document fidelity & round-trips

**Goal:** opening, saving, and re-opening documents preserves content
byte- and pixel-faithfully.

**User stories**

| id | as a … | I want to … | so that … | acceptance |
|---|---|---|---|---|
| us-fi-1 | end user | open a real docx | I can read and edit it | doc loads, text renders (`#editor` non-empty, sheets render) |
| us-fi-2 | end user | save and reopen | nothing is lost | save → reopen keeps content (conformance corpus, 06-font-times byte-identical) |
| us-fi-3 | end user | documents look like OO | switching tools isn't jarring | visual/chrome pixel gates stay within baseline |

**Acceptance (e2e):** `document-content.spec.ts` (content presence) + the
committed geometry/chrome/visual gates.

---

## Backlog discipline

- Every epic is **e2e-gated** — a spec under `server/tests/e2e/tests/documents/`
  proves the user story; the parity stack proves the system.
- New work follows the map doctrine: *loud, not silent* — stubs/unimplemented
  rows stay declared in the register until the e2e flips them.
- dispatch: each epic is an agentflow campaign (spec → `af run` → gate →
  census/chrome verify → baseline → push).