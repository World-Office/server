# PACKAGES

**Generated:** 2026-04-19 | **License:** AGPL-3.0 | **Namespace:** `@world-office`

## OVERVIEW

9 shared TypeScript packages for the web editor frontend. Part of pnpm workspace.

## STRUCTURE

```
packages/
├── editor-common/        # Shared React components + utilities (42 files, 40 ts/tsx)
├── design-system/        # Design tokens, theme, primitives (38 files, 36 ts/tsx)
├── collaboration-client/ # Collaboration protocol client (13 files, 11 ts/tsx)
├── collaboration-react/  # React bindings for collaboration (14 files, 12 ts/tsx)
├── editor-stores/        # Editor state management (8 files, 6 ts/tsx)
├── sdk-bridge/           # SDK bridge layer (9 files, 7 ts/tsx)
├── i18n/                 # Internationalization (4 files, 2 ts/tsx)
├── spellchecker/         # Client-side spellchecker (nspell, Hunspell dictionaries, 8 source files)
├── eslint-config/        # Shared ESLint configuration (2 files)
└── tsconfig/             # Shared TypeScript configuration (4 files)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Shared UI components | `editor-common/src/components/` | 14 components |
| Design tokens | `design-system/src/` | Theme, primitives |
| Editor state | `editor-stores/` | Zustand or similar |
| Collaboration | `collaboration-client/`, `collaboration-react/` | Client + React bindings |
| Lint rules | `eslint-config/` | Shared across all editor apps |
| TS config | `tsconfig/` | Base configs for all packages |

## CONVENTIONS

- All packages under `@world-office` npm namespace
- pnpm workspace: `packages/*` in root `pnpm-workspace.yaml`
- CI runs `pnpm lint`, `pnpm typecheck`, `pnpm build` across workspace

## ANTI-PATTERNS

- NEVER add components to individual editor apps that belong in `editor-common`
- NEVER bypass shared eslint-config with per-app overrides without justification
- Changes to `design-system` tokens propagate to ALL editor apps
