# 02 — Architecture Constraints

## Technical constraints

| Constraint | Consequence |
|------------|-------------|
| **Python 3.12 + FastAPI + uv** | The runtime is one interpreter; `uv sync --frozen` is the only dependency gate (dev group must carry every test dep — enforced by CI). |
| **Stdlib-first / Stoic-small** | MCP server is ~200 lines of hand-rolled JSON-RPC; no MCP SDK. Parsers are stdlib + python-docx. |
| **No vendor SDKs in-process** | Model providers connect through *transports the caller injects* (`ai/adapters.py`). The server never opens model egress itself; privacy stays deployable on-prem. |
| **WOPI is the integration contract** | CheckFileInfo, Lock/Unlock/Refresh/GetLock, GetFile/PutFile with `X-WOPI-Lock` semantics — byte-exact, including the 409 lock-mismatch contract. |
| **SQLite + content dir** | `data/docserver.db` (index, versions, locks) + `data/documents/` bytes. No external DB; backup = copy the data dir. |
| **Single node** | The collaboration hub is in-process memory. Scale-out is explicitly out of scope (see risks). |

## Organizational constraints

- **Rethink directive (2026-08):** the Python rewrite is the canonical product; Rust stack is reference-only.
- **Tests are the spec:** features may only claim register coverage via tagged passing tests or a
  documented divergence — enforced by `check-register.py` in CI.
- **Licensing:** server is AGPL-3.0-compatible context; artwork MIT.

## Technical debt / deviations

- `editor.js` is a single vanilla-JS file (~3k lines) — deliberate (no build step), growing unwieldy.
- The docserver trusts the cloud's auth via WOPI access tokens; there is no independent user store.
