# WEB EDITOR FRONTEND

**Generated:** 2026-04-19 | **License:** AGPL-3.0

## OVERVIEW

Web-based document editing suite. Modern React editors in TypeScript. Part of pnpm workspace.

## STRUCTURE

```
apps/web/
├── apps/
│   ├── common/                    # Shared editor code (217 JS files)
│   ├── spreadsheeteditor-react/   # React editor (35 ts/tsx)
│   ├── documenteditor-react/      # React editor (40 ts/tsx)
│   ├── presentationeditor-react/  # React editor (35 ts/tsx)
│   ├── pdfeditor-react/           # React editor (30 ts/tsx)
│   ├── visioeditor-react/         # React editor (26 ts/tsx)
│   ├── editor-shell/              # Shared shell (13 ts/tsx)
│   └── api/                       # API layer (1 JS)
├── vendor/                        # Vendored libs (ace, backbone, monaco, requirejs, underscore)
├── theme/                         # Editor themes
├── translation/                   # i18n translations
└── test/                          # Web-level tests
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Document editing | `apps/documenteditor-react/` | React, TypeScript |
| Spreadsheet editing | `apps/spreadsheeteditor-react/` | React, TypeScript |
| Presentation editing | `apps/presentationeditor-react/` | React, TypeScript |
| PDF editing | `apps/pdfeditor-react/` | React, TypeScript |
| Shared code | `apps/common/` | 217 JS files, shared by all editors |
| Shared components | `apps/editor-shell/` | Shell, toolbar, menu |
| Vendored code | `vendor/` | DO NOT MODIFY — ace, backbone, monaco, requirejs, underscore |

## CONVENTIONS

- React editors under `apps/*-react/` with TypeScript
- Help resources (images, function docs) account for bulk of file count
- Mobile stores in `apps/*/mobile/src/store/`

## ANTI-PATTERNS

- NEVER modify `vendor/` — frozen vendored dependencies
- NEVER add editor-specific logic to `apps/common/` — shared only
- Changes to `apps/common/` affect ALL editor apps

## NOTES

- `apps/web/` has NO `package.json` — workspace membership via root `pnpm-workspace.yaml`
- Bulk of files are help resources (images, translated function docs), not code
- Actual code: ~230 TS/TSX files across all editor apps
