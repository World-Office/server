# 06 — Runtime View

## Scenario 1: Open a cloud document (the `/app/open` flow)

1. User clicks an ODT in OpenCloud → OpenCloud resolves the app via its app-registry /
   collaboration registration → browser opens docserver `/app?doc=…` iframe.
2. Editor JS fetches WOPI discovery (cached) → docserver issues a JWT access token for the file.
3. `GET /wopi/files/{id}` (CheckFileInfo) → size, version, user, permissions.
4. `GET /wopi/files/{id}/contents` → bytes → `odt_to_html`/`docx_to_html` → editor DOM.
5. Hub seeds the CRDT from the plain-text projection; user edits; 30 s debounce autosave →
   `store.put_content` (version snapshot) → `PUT /wopi/files/{id}/contents` with `X-WOPI-Lock`.

## Scenario 2: Two humans + one agent

1. Browser A and B connect; hub assigns sites; presence chips show stable-hue peers.
2. A types → op `(A, n)` → hub log → B receives → deterministic merge.
3. Agent `alfie` joins over MCP: `presence` (agent badge) → `get_context` (grounding pack) →
   `lock` (first-writer-wins; conflicts = 409 contract) → `apply_ops` ops `(agent=alfie, n)`.
4. Browser B sees alfie's caret and text appear mid-stream — no special path, no replay.
5. Review: `ai/review.summarize` renders the op log as rows, agent ops flagged by site prefix.

## Scenario 3: Agent run under budgets (provider fault injected)

1. Operator runs `AgentRunner(AnthropicModel(transport), max_steps=25, max_ops=200)`.
2. Turn 1: transport returns `tool_use read_doc` → runner calls the tool → transcript grows.
3. Turn 2: transport *raises* `ConnectionError` → `_safe_model` absorbs → zero calls → `done`.
4. Document unchanged; report: `steps=2, ops_applied=0, stopped_reason="done"`.
   The same run with OpenAIModel on healthy transports yields byte-identical ops (differential test).

## Scenario 4: Export

`POST /api/documents/{id}/export?format=pdf` → HTML → WeasyPrint (`fonts-dejavu-core` mandatory)
→ `application/pdf` + `X-Export-Engine: weasyprint`. Missing engine ⇒ loud 500. ODT/DOCX/HTML
downloads project the stored bytes verbatim (byte-verbatim contract tests).
