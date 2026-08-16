# Ribbon-Command-Graph (World-Office, Stand 2026-08-16)

Graph-basierte Zerlegung des Problems „Buttons feuern ins Leere“.
Quelle: CodeGraph (Neo4j) + statische Extraktion aus den Ribbon-Specs.

## 1. Zustandsgraph (gemessen)

```
                  ┌──────────────────────────────┐
                  │  5 Editor-Apps (document,    │
                  │  sheet, slide, pdf, visio)   │
                  └──────────────┬───────────────┘
                                 │ rendern
                  ┌──────────────▼───────────────┐
                  │  Ribbon (editor-common)      │   81+84+117+57+12 Controls
                  │  = 5 Specs, ~330 Controls    │   = 270 unique commands
                  └──────────────┬───────────────┘
                                 │ dispatch (Toolbar.tsx)
                  ┌──────────────▼───────────────┐
                  │  3 Ziele je App:             │
                  │  onMonacoCommand             │
                  │  onRichTextCommand (9→31)    │
                  │  onCommand → wo-command-Event│
                  └──────┬──────────┬────────────┘
                         │          │
            ┌────────────▼───┐  ┌───▼───────────────┐
            │ WASM-Engine    │  │ Listeners:        │
            │ wo-renderer    │  │ ✗ KEIN Listener   │
            │ (7 Keys)       │  │   im Word-Editor  │
            └────────────────┘  └───────────────────┘
                              ▲
                              │ 55+ tote Commands landen hier (nirgends)
```

## 2. Knoten-Bilanz (gemessen, 2026-08-16)

| App   | Spec-Commands | Controls | verdrahtet | tote | Anteil tot |
|-------|--------------|---------|-----------|------|-----------|
| word  | 78           | 81      | 23        | 55   | **68 %**   |
| sheet | 74           | 84      | ~5        | ~69  | **~82 %**  |
| slide | 114          | 117     | ~3        | ~111 | **~95 %**  |
| pdf   | 44           | 57      | ~8        | ~36  | **~63 %**  |
| visio | 7            | 12      | ~2        | ~5   | **~42 %**  |

(„verdrahtet“ = nachweisbarer Listener/Effekt; Stand vor K1-Skript.)

## 3. Word: 78 Commands nach Tab und Verdrahtungsweg

| Tab        | #  | Weg A: WASM     | Weg B: lib/UI    | Weg C: Store-Toggle | Weg D: fehlt Engine |
|-----------|----|-----------------|------------------|---------------------|---------------------|
| home      | 34 | bold, italic, underline, strike, subscript, superscript, fontSize, fontFamily, textColor, highlight, clearFormatting | bulletList, orderedList, taskList, align*, indent, outdent, lineSpacing, blockquote, codeBlock, heading1-3, cut/copy/paste/undo/redo | — | find, replace |
| insert    | 5  | —               | horizontalRule, image, link, insertTable (Panels) | — | pageBreak |
| layout    | 15 | —               | editHeader, editFooter, columns | differentFirstPage, differentOddEven, removeHeader, removeFooter, pageMargins/Orientation/Size | insertSectionBreak, insertPageNumber, openTheme |
| references| 9  | —               | insertFootnote, insertEndnote, insertToc, updateToc, insertIndex, updateIndex (lib vorhanden!) | toggleComment, addComment | insertIndexEntry |
| review    | 6  | —               | —                 | toggleTrackChanges, accept/reject/next (lib vorhanden!) | — |
| view      | 6  | —               | —                 | toggleGridlines, toggleNavigation, toggleRuler, toggleSpellCheck, zoomIn/Out | — |
| forms     | 4  | —               | —                 | —                     | insertCheckbox/DatePicker/Dropdown/PlainText |

**Beobachtung:** Für ~40 der 78 Commands existieren bereits fertige lib-Funktionen
oder Panels — sie müssen nur **angebunden** werden, nicht neu programmiert.

## 4. Abhängigkeitsgraph der Teilaufgaben (Plan)

```
K1 audit-script ─┐
K5 sheet ────────┤  benötigen K2 (Command-Bus)
K6 slide ────────┼──► K2 bus ──► K3 word-mapper ──► K4 insert/layout-Tabs
K7 pdf ──────────┤                    │
K8 visio ────────┘                    ▼
                          K9 dead-code-Hygiene ──► K10 E2E-Toolbar-Tour
```

Kritischer Pfad: K2 → K3 → K4 → K9 → K10
Parallel: K5–K8 (taskfleet, 4 Worker)