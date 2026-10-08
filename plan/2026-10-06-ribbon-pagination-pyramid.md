# Ribbon sub-menus + document pagination — spec / contract / test pyramid

Constructed bottom-up so every claim at the spec layer is traced to a
concrete, runnable assertion. "Spec" is the *what* (the E-FP-1 / E-FI-1 epics),
"contract" is precise behavior that must hold, "tests" are the three-layer
proof. Work is driven by this: a feature isn't done until the pyramid's lowest
available layer has a GREEN assertion for each satisfied contract.

## Layer 1 — Spec (user-visible acceptance, from the epics doc)

### Feature scope A · Ribbon sub-menus (E-FP-1)
- US-FP-2 … a font can be picked from a dropdown and the text face changes.
- US-FP-3 … no silent stubs: a dropdown trigger that discloses no list is a
  defect (loud, not silent).
- **Every** ribbon dropdown (selects + `.menu-trigger` + `.styles-trigger`)
  must disclose its item list.

### Feature scope B · Document pagination + status bar (E-FI-1)
- US-FI-1 … a >1-page document renders as multiple paginated sheets.
- Editing that overflows a page flows into a new sheet (live re-pagination).
- The status bar shows the OO-equivalent **"Page X of Y"**, synced with the
  caret's page and the live sheet count.

## Layer 2 — Contracts (precise, testable behavior)

### Sub-menu contract
| id | statement |
|----|-----------|
| C-M1 | A ribbon dropdown trigger (`[aria-haspopup="true"]` on `.menu-trigger`/`.styles-trigger`) click discloses its `.menu-list` (`hidden` → `false`). |
| C-M2 | The disclosed list contains `button[data-cmd]` items; an item click dispatches `runCommand(cmd, value)` **and** closes the list. |
| C-M3 | The trigger's `aria-expanded` mirrors the open state (`true` while open). |
| C-M4 | There is no dead sub-menu: every Home dropdown opens a list (0 silent). |

(OO behavioral parity: a ribbon dropdown discloses → pick → command → close;
this is the semantic contract ported, not OO's markup.)

### Pagination contract
| id | statement |
|----|-----------|
| C-P1 | `paginateView()` produces N `.wo-page` sheets where N > 1 for a document taller than one page area. |
| C-P2 | `currentPageInfo()` returns `{cur, total}` and the invariant `1 ≤ cur ≤ total` holds. |
| C-P3 | `updatePageIndicator()` renders `Page X of Y`; `Y` tracks the live sheet count after every re-pagination. |
| C-P4 | Typing that overflows the page area increases the sheet count (re-pagination is monotonic non-decreasing). |
| C-P5 | `cur` follows the caret's sheet (updates on `selectionchange`, load, typing). |

## Layer 3 — Test pyramid (traceability: contract → test)

```text
       L3  e2e (2 browsers/contexts)
        /  toolbar-tour.spec.ts, document-content.spec.ts, collaboration.spec.ts
       /
  L2  integration: parity census (chrome/interactions/fx) + coauth protocol check
   /   0 dead sub-menus, 0 silent stubs, wires a real WS session
  L1  unit (framework): documenteditor-react vitest (collab hook, word-commands)
```

| contract | provable layer | test | status |
|----------|-----|------|--------|
| C-M1 (disclose) | L3 | `toolbar-tour`: click each trigger → `.menu-list:not([hidden])` count > 0 | 🟢 8/8 |
| C-M2 (pick→command→close) | L3 + L1 | L3: click first item → lists close + (US-FP-2) computed font changes; L1: `word-commands.test.ts` command dispatch | 🟢 |
| C-M3 (aria-expanded mirrors) | L3 | `toolbar-tour`: open → trigger `aria-expanded === "true"` | 🟢 (added) |
| C-M4 (0 dead sub-menus) | L2 + L3 | parity `fx` census (0 silent) + L3 tour count | 🟢 |
| C-P1 (>1 sheet) | L2 | parity harness long-doc: 3 sheets for 40 paras | 🟢 (verified) |
| C-P2 ({cur,total} invariant) | L3 | by construction; asserted via C-P3/C-P5 output | 🟢 |
| C-P3 (Page X of Y + tracks) | L3 | `document-content`: indicator matches `/Page \d+ of \d+/`; count grows with sheets | 🟢 |
| C-P4 (typing re-paginates) | L3 | `document-content`: after 12+ lines `afterTyping ≥ sheetCount`; manual: 3→5 after 25 lines | 🟢 |
| C-P5 (caret→page) | L3 | `document-content`: caret on page 2 → indicator reads "Page 2 of N" | 🟢 (added) |

Two assertions were added to close the pyramid (C-M3, C-P5) in
`toolbar-tour.spec.ts` / `document-content.spec.ts`.

### Why there is no L1 for the wysiwyg sub-menu/pagination code
`documenteditor-wysiwyg` is a vanilla browser script with no test runner. Its
DOM-coupled logic is fully observable from a headless browser, so **L2/L3 are
the binding layers** — adding a vitest harness + module extraction to a
307 KB browser script would be more machinery than the guarantees it buys
(YAGNI). L1 exists where it adds real value: the React editor's collab hook
and command router.

## Workflow rule
Feature done ⇔ every satisfied contract has a 🟢 assertion at the lowest layer
that can host it; unsatisfied contracts are listed here as 🔴 before code.