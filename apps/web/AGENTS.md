# WEB EDITOR FRONTEND

**Updated:** 2026-11-27 | **License:** AGPL-3.0

## OVERVIEW

No React lives here any more: the five `*-react` editor apps and
`editor-shell` were removed 2026-11-27 (ADR-F1). This directory now holds the
Leptos/WASM ribbon PoC and the unbuilt legacy vanilla tree. There is no
buildable editor UI in the repo until the Leptos port lands.

## STRUCTURE

```
apps/web/
├── apps/
│   ├── ribbon-leptos/   # Leptos 0.8 + Trunk PoC, Home tab only (not a pnpm workspace member)
│   ├── common/          # Legacy ONLYOFFICE vanilla JS tree — not built, no dependents
│   └── api/             # API layer (1 JS)
├── theme/               # Editor themes
├── translation/         # i18n translations
├── vendor/              # Legacy vendored JS libraries (no React)
└── test/                # Web-level tests
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Leptos ribbon UI | `apps/ribbon-leptos/` | Rust → wasm; build with `trunk build --release` |
| Ribbon specs (source of truth) | `packages/editor-common/src/ribbon/specs/` | word, spreadsheet, presentation, pdf, visio |
| Legacy vanilla code | `apps/common/` | Dead tree; deleting it is a pending decision |

## CONVENTIONS

- `ribbon-leptos` has no `Trunk.toml`; if it ever becomes a workspace member, add one pinning `[tools] wasm-bindgen = "0.2.118"` (the engine's pin)
- Never reintroduce React here — the chrome moves to Leptos/WASM (ADR-F1)

## NOTES

- `apps/web/` has NO `package.json`; nothing under `apps/web/apps/` is a pnpm workspace member
- Bulk of files in `apps/common/` are help resources (images, translated function docs), not code
