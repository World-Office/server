# PLAN — Ribbon-Commands verdrahten (Word-Editor, dann alle 5)

> **Problem:** Die Toolbar zeigt 81 Controls und feuert 78 Commands, aber nur 23
> sind tatsächlich mit einer Wirkung verbunden. ~55 Commands sind **tote Buttons**:
> sie dispatchen ein `wo-command`-Event, das niemand zuhört (im Wort-Editor gibt es
> **keinen einzigen** `addEventListener("wo-command")`).
>
> Ursache: Zwei parallele Command-Systeme — die TipTap-`rte-command.ts`-Bridge
> (30+ Commands, verdrahtet für den **alten** RichTextEditor) und der
> WASM-`CanvasEditor` (aktiv, aber nur 9 Format-Commander über den Router in
> `DocumentHolder.tsx`). Das Canvas löst die RTE-Bridge ab, aber der
> Command-Router wurde nie auf die volle Breite portiert.
>
> Graph-basierte Zerlegung (siehe `plan/ribbon-command-graph.md`).

## Zielbild (vereinfachter Befehlsfluss)

```
Ribbon-Control (81) 
  → Ribbon.disptch (Toolbar.tsx): 3 Ziele
      ├─ onMonacoCommand       (Text-/Code-Modus)
      ├─ onRichTextCommand     → RichTextCommand-Typ (rte-command.ts)
      └─ onCommand (wo-command)→ CustomEvent, aktuell ohne Listener
```

**Akzeptanzkriterium (Definition of Done):**
A1. Jeder sichtbare Button ruft eine nachweisbar wirkende Funktion auf
    (Pixel-/Modelländerung, Panel öffnen, Dialog zeigen, Zustand togglen).
A2. Kein `wo-command`-Event feuert ungehört (Listener registriert).
A3. `pnpm exec tsc` grün in allen 5 Editor-Apps; E2E: Tippen + Bold via UI.
A4. Alle 5 Apps: Ribbon-Spec ≤ 5 % tote Controls (testbar per Skript).

---

## Teilaufgaben (Graphen-Knoten, parallelisierbar)

### K1 — Command-Audit & Coverage-Skript [0.5 d]
Messe die Lücke automatisiert, damit sie nie wieder wächst:
- Skript `tools/ribbon-coverage.mjs`: liest alle 5 `*-ribbon.ts`-Specs, extrahiert
  Commands, kreuzt sie mit registrierten Routern (`registerEditorRouter(…, cmds)`),
  gibt `wired / total` je App aus. Exit-Code 1 bei < 95 % Coverage (CI-Gate).
- Commit als `chore(routing): coverage script`.

### K2 — Zentraler Command-Bus [1.5 d]  ← Fundament
Ein einziger, expliziter Listener statt feuernder Events ohne Empfänger:
- Neues Modul `packages/editor-common/src/commands/command-bus.ts`:
  `executeCommand(kind, cmd, value)` mit Registry je Editor-Kind ("doc" | …).
- `Toolbar.tsx` (alle 5) dispatcht NUR noch über den Bus (kein nacktes
  `window.dispatchEvent(new CustomEvent("wo-command", …))` mehr).
- Die bestehende `registerEditorRouter`-Registry wird in den Bus integriert
  (gleiche Signatur, Abwärtskompatibilität; Tests in editor-common erweitern).

### K3 — Word: WASM-Command-Mapper vollständig [2 d]  ← größter Brocken
Erweitert den Router in `DocumentHolder.tsx` (WasmEditorCanvas) von 9 auf alle
78 Word-Commands. Klassifizierung je Command:
- **hat WASM-Unterstützung** (bold, italic, underline, strike, fontSize,
  fontFamily, textColor, highlight, align?, heading?): via `applyFormatting`.
  → WASM `apply_formatting` (wo-renderer-wasm) um fehlende Keys erweitern
    (aligns, heading styles, clearFormatting, subscript/superscript).
- **hat TipTap/lib-Funktion, aber kein WASM-Äquivalent** (bulletList,
  orderedList, taskList, indent, outdent, lineSpacing, blockquote, codeBlock,
  insertFootnote, insertEndnote, insertToc, updateToc, addComment,
  toggleTrackChanges, accept/reject/nextChange): Rückgriff auf die vorhandenen
  `lib/rte-command.ts`-/`lib/track-changes`-Funktionen über eine schmale
  TipTap-Instanz ODER Canvas-Modell-Operation (wo-ooxml-ops) umsetzen.
- **UI-Aktion** (find, replace, image, link, pageBreak, insertTable,
  horizontalRule, insertHeader/Footer, insertPageNumber, columns, …): Panel
  oder Dialog öffnen (FindReplacePanel, ImagePanel usw. existieren bereits).
- **Zustandstoggle** (toggleGridlines, toggleNavigation, toggleRuler,
  toggleSpellCheck, differentFirstPage/OddEven, removeHeader/Footer):
  Store-Properties setzen (meist vorhanden, nur verdrahten).

### K4 — Word: insert/layout/references/review/forms Tabs [1.5 d]
Die 5 „dünnen“ Tabs haben zusammen nur 39 Controls, aber es fehlen Dialoge:
- Insert: horizontalRule, image, link, pageBreak, insertTable → vorhandene
  Panels öffnen + Canvas-Einfüge-Op (wo-ooxml-ops: `insert_table`,
  `insert_image_ref`, `insert_hyperlink`, `insert_page_break`).
- Layout: editHeader/editFooter (bestehen schon als Modi), columns,
  pageMargins/Orientation/Size (Dialog + Model-Props setzen).
- References: insertFootnote/Endnote/Toc/Index → vorhandene
  `lib/footnote-mark.ts`, `lib/endnote-mark.ts`, `toc-extension.ts` anbinden.
- Review: track-changes → `lib/track-changes/index.ts` (existiert komplett).
- Forms: 4 Content-Controls → wo-ooxml-ops Formular-Felder oder Dialog.

### K5 — Sheet: 74 Commands verdrahten [2 d]
- Univer-API ist da (`../lib/univer-command.ts`): Sum/Average/Count/Max/Min/
  VLookup → Formel-Setzen; currency/percent/decimal/formatCells → Zahlformat;
  mergeCells, conditionalFormatting, filter, sort, freeze → Univer-Commands.
- insertChart/…, insertImage, insertLink → vorhandene Dialoge/Panel.
- Prüfen: tote Controls via K1-Skript auf < 5 %.

### K6 — Slide: 114 Commands verdrahten [2 d]
- größte Spec; viele Animation/Transition-Commands (setTransition*, 
  setAnim*) → bestehende SlideCanvas-API anbinden oder als „deaktiviert“ mit
  Tooltip markieren (ehrlicher als toter Button).
- insertShape/TextBox/Table/Chart, alignObjects, arrange, groupObjects →
  Slide-Modell (WoPresentation) Operationen.

### K7 — PDF: 44 Commands verdrahten [1 d]
- annotation* → AnnotationEditor (existiert), insertImage/Link/HeaderFooter/
  PageNumber → pdf-lib oder Annotation-Layer; zoom/fitToPage/fitToWidth
  → PdfStore (existiert); redact* → RedactPanel.

### K8 — Visio: 7 Commands [0.5 d]
- reshape, zoom, themes, toggleMinimap, toggleLeftPanel, exportSvg,
  fitToPageVisio → FlowchartStore (existiert), nur verdrahten.

### K9 — Dead-Branch-Hygiene [1 d]
Nach K2–K8: `cgc analyze dead-code` erneut laufen lassen; die 50 gefundenen
unverdrahteten Funktionen entweder anbinden oder entfernen. Ziel: dead-code
unter Schwelle; CI-Gate mit K1-Skript.

### K10 — E2E-Verifikation [1 d]
Playwright-Szenario „Toolbar-Tour“ je App: jede sichtbare Control anklicken,
danach Zustand prüfen (Canvas-Pixel-Hash, Modell-JSON, Panel sichtbar).
Erweitert `tests/` mit Daten-driven Coverage-Test (liest K1-Skript-Output).

---

## Reihenfolge & Abhängigkeiten

```
K1 (Audit-Skript) ──┐
K2 (Command-Bus) ───┼──► K3 → K4 → K9 → K10   (Word zuerst, dann Rest)
                    │
K5, K6, K7, K8 ─────┘   (parallel nach K2, da alle den Bus brauchen)
```

- **Kritischer Pfad:** K2 → K3 → K4 → K9 → K10 (~5.5 d)
- **Parallel nach K2:** K5/K6/K7/K8 (je 0.5–2 d, per taskfleet-Worker teilbar)
- **Früher Nutzen:** K3 allein (9→78 Commands im Word) liefert sichtbar „viele
  funktionierende Buttons“ — das ist vermutlich genau das, was der Nutzer prüft.

## Ressourcen & Werkzeuge
- taskfleet für K5–K8 (4 Worker parallel, Gates: `pnpm exec tsc` je App +
  K1-Coverage-Skript).
- CodeGraph (Neo4j, läuft) für nach K9 erneutes dead-code-Audit.
- Vorhandene Assets, die nicht neu gebaut werden müssen:
  `lib/rte-command.ts` (30+), `lib/track-changes/`, `lib/footnote-mark.ts`,
  `lib/endnote-mark.ts`, `lib/toc-extension.ts`, `lib/univer-command.ts`,
  Panels: FindReplace, Comments, TrackChanges, Image, Table, Shape, Form.

## Risiken
1. WASM `apply_formatting` deckt nur 7 Keys — Erweiterung nötig (K3), Aufwand
   klein, da nur Layout-Mapping (bereits in `layout_document`-Pfad vorhanden).
2. TipTap-`rte-command.ts` referenziert `@tiptap/core` — das Paket wurde
   entfernt („TipTap removed (A1)“). Die lib-Funktionen müssen auf Canvas-
   Operationen portiert werden ODER eine schmale TipTap-Instanz nur für
   Befehle (ohne Rendering) wieder eingeführt werden. Entscheidung in K3.
3. „Ehrliche Deaktivierung“ (Tooltip „bald verfügbar“) ist besser als toter
   Button — erlaubt, K6 bei Bedarf zu kappen.
4. Coverage-Skript darf nicht falsch-negativ sein (dynamische Dispatcher).
   Lösung: explizite Registry im Bus (K2) statt String-Matching.

## DoD-Gate (CI)
`pnpm ribbon-coverage` (K1-Skript): je App ≥ 95 % der sichtbaren Controls
verdrahtet; sonst Build rot.