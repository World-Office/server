# 05 — Building Block View

## Level 1 — the service

```
opencloud-docserver/
├── src/
│   ├── main.py            # FastAPI app assembly, static UI, lifespan
│   ├── config.py          # Config: toml + env overlay (port, jwt, agents_enabled…)
│   ├── editor/            # job 2 + 3: collaboration and conversion
│   │   ├── router.py      #   /api/documents/* endpoints (new, save, export, info)
│   │   ├── collab.py      #   CollabHub + TextCRDT + op log + presence (in-memory)
│   │   ├── converter.py   #   DOCX ⇄ HTML (python-docx + streaming writer)
│   │   ├── odt_converter.py#  ODT ⇄ HTML (stdlib zip/xml)
│   │   └── sanitize.py    #   HTML sanitization for the editor model
│   ├── wopi/              # job 1: the cloud contract
│   │   ├── protocol.py    #   discovery XML, check-file-info, token/JWT helpers
│   │   └── router.py      #   /wopi/* endpoints (files, contents, locks)
│   ├── ai/                # job 4: the agent surface
│   │   ├── tools.py       #   6 tools → ToolContext(store, hub)
│   │   ├── schemas.py     #   versioned JSON-Schema catalog (v1.1)
│   │   ├── runner.py      #   AgentRunner: model callable → tool calls → ops
│   │   ├── adapters.py    #   Anthropic/OpenAI translators + transport Models
│   │   ├── review.py      #   op-stream diff human vs agent (review rows)
│   │   └── mcp.py         #   MCP stdio server (JSON-RPC 2.0, NDJSON)
│   └── lib/store.py       # SQLite index + content/versions/locks on disk
├── web/                   # editor UI: index.html + editor.js (vanilla, no build)
├── tests/                 # 1,476 tests (contract, property, model-based, goldens, e2e)
├── e2e/                   # Playwright GUI suite against the live stack
└── Dockerfile             # python-slim + uv + fonts-dejavu-core (PDF glyphs!)
```

## Level 2 — whitebox: the request paths

**Browser edit** `POST /api/documents/{id}/ops` → `sanitize` (if html) → `CollabHub.apply_ops`
(dedup by op key, Lamport validation, log append, presence broadcast) → persisted at autosave
via `store.put_content` (byte snapshot → version row) and, in cloud mode, WOPI PutFile.

**Agent edit** `MCP tools/call apply_ops` → `ai.tools.tool_apply_ops` → `compile_text_edit`
(agent indices → CRDT wire ops with global-clock seq) → same `CollabHub.apply_ops` as browsers.

**Open from cloud** Caddy → `GET /wopi/files/{id}/contents` (Bearer JWT) → `store`/cloud fetch →
`converter` HTML → editor iframe.

**Grounding** `MCP tools/call get_context` → `_base_text` (converter → same text the editor sees)
→ CRDT snapshot → bounded text + line blocks + version tail + sha256.

## Level 3 — the CRDT op

Every mutation is one JSON op: `{"t": "insert"|"delete", "s": site, "b": seq, "chars"/ids…}`.
Identity = `(site, seq)` under a Lamport clock; ordering is deterministic on every replica;
`ROOT` anchors the document start. The op log *is* the audit trail — `ai/review.py` summarizes
agent vs human rows from it.
