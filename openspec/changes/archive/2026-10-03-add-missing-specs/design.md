## Context

The project has grown organically with code being written before documentation. Seven spec documents exist in `plan/specs/` covering UI pages, AI, DB connectors, PDF signing, storage, and spellchecker. Five major subsystems spanning Rust services (wo-wopi, wo-docserver), Node.js services (DocService, FileConverter), an Express deployment companion (integrations/opencloud), and E2E test infrastructure have zero specification coverage.

Each spec follows a consistent pattern established by the existing docs: status header, architecture overview, current state, requirements with scenarios, file manifest, and verification steps. The new specs should match this pattern exactly.

**Key constraint:** No spec content should be AI-hallucinated — every statement must be grounded in actual codebase research (existing files, interfaces, configuration).

## Goals / Non-Goals

**Goals:**
- 5 new spec documents covering the undocumented subsystems
- Each spec is grounded in actual codebase structure (files, APIs, configurations that exist today)
- Specs follow the existing pattern: current state → requirements → file manifest → verification
- Specs live in the change's `specs/` dir, ready for sync to main specs

**Non-Goals:**
- No implementation work
- No code changes
- No architectural changes
- No spec for subsystems already covered (admin-pages, AI, etc.)
- No overhaul of the spec format itself

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Spec location | Change-local `specs/<capability>/spec.md` then sync to main | Follows OpenSpec workflow — delta first, then sync |
| Spec format | Follows existing pattern (status, architecture, requirements, scenarios, verification) | Consistency with existing 7 specs; readers already familiar |
| Research method | Read all key source files in each subsystem before writing | Prevents AI-hallucinated spec content |
| Capability granularity | One spec per natural subsystem boundary | Matches how code is organized (opencloud/ is independent from wopi-collaboration/) |
| Scenario level | Integration-level (not unit-test granularity) | Spec describes what the system does, not implementation internals |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Spec drifts from code if subsystems evolve | Specs include "Last Verified" date; revisit during implementation work |
| Requirements written as "should" not "shall" | Use normative SHALL/MUST language per spec-driven convention |
| Change specs diverge from main `plan/specs/` | Sync (`openspec-sync-specs`) as part of completion checklist |
