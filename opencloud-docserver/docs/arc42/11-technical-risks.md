# 11 — Technical Risks

| Risk | Likelihood | Impact | Mitigation / watch item |
|------|-----------|--------|--------------------------|
| **Hub memory growth** — CRDTs + op logs of all live docs sit in process memory | medium | medium | Snapshots prune version files; op-log tails are bounded in reads; restart clears memory. Watch: long-lived docs on the live stack. |
| **Single node** — no horizontal scale-out, no multi-docserver WOPI locks | certain | low (current scale) | Explicit non-goal; SQLite + in-process hub chosen for Stoic simplicity. Revisit only if concurrent-doc count demands it. |
| **Converter fidelity drift** — DOCX/ODT edges (tables, fields, anchored objects) lose fidelity | medium | medium | Differential + property + golden tests; byte-verbatim download contract; oracle scores against LibreOffice truth. Known divergences registered. |
| **Model provider instability** — vendor outages, malformed responses | medium | low | Typed `AdapterError` absorbed by the runner; document untouched; report shows stop reason. Usage accounting keeps spend visible. |
| **Prompt injection via document content** — a malicious document instructs an agent | medium | high (if ignored) | Agents only act through the 6 tools; writes are lock-scoped and budgeted; review stream makes every op visible. Standalone anti-injection hardening remains backlog (E17). |
| **fonts/packages drift in image** — slim base changes break PDF/export | low | high | Dockerfile pins fonts-dejavu-core; container validation (throwaway port + curl + %PDF check) before every deploy. |
| **`editor.js` monolith** — 3k-line vanilla file gets harder to change | certain | medium | Accepted debt; changes guarded by surface tests (data-cmd + btn-* wiring assertions) and GUI sweep tests. |
| **Registration fragility on the live stack** — `/app/open` depends on app-registry + collaboration handshake | low | high | 5★ runbook: `app-registry.yaml` (with `default_app`) lives in the opencloud config volume; staging mirrors it; healthcheck changes A/B on staging first. |

## Signals to watch

- pytest suite time (currently ~3 min) and flake rate on the live-stack E2E markers.
- Register gate failures — they are *good* failures (drift caught), but frequency signals process friction.
- Tika/collaboration container health after image upgrades.
