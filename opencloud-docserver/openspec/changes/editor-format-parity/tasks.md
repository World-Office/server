# Tasks: Editor Format & Function Parity

TDD per category: write failing contract test → implement converter + UI → verify green.

## inline-text
- [x] T1 contract test: color/background round-trips in DOCX + ODT — DOCX already green (format-advanced); ODT now emits `fo:color`/`fo:background-color` via `TextProperties` and round-trips both.
- [x] T2 implement color/highlight in both converters — `_apply_run_style` (DOCX) + ODT `char_style`/resolver extended; symmetric HTML contract (one `style=` span).
- [x] T3 contract test: font-family/font-size round-trips — `test_html_to_docx_font_family_size_roundtrip` + `test_html_to_odt_font_family_size_roundtrip` (Georgia + 14pt).
- [x] T4 implement font-family/font-size emit/parse (both converters) — `w:rFonts`/`w:sz` on DOCX; `fo:font-family`/`fo:font-size` on ODT; `_parse_font_size` normalises pt/px.
- [x] T5 contract test: sup/sub/strike/small-caps/all-caps/inline-code round-trips — both suites (ODT: `style:text-position` `super`/`sub`; `text-line-through-style`; `font-variant`; `text-transform`).
- [x] T6 implement sup/sub/strike/caps/code (both converters) + editor.js commands — `runCommand` cases code/smallCaps/allCaps (`toggleMonospace` via fontName=Consolas, `toggleInlineCSS` wrap/unwrap + `cloneContents` to preserve nested formatting); toolbar buttons SC / Ā / `</>`; `updateActiveStates` reads `spanStyleActive`/`fontIsMono`; sanitizer now keeps `<strike>/<del>/<code>` (this was a real data-loss bug: `<strike>` was stripped before conversion). E2E `test_inline_format_commands_code_caps_strike`.

## paragraph
- [ ] T7 contract test: line-spacing/indent/spacing/rtl/page-break-before round-trips
- [ ] T8 implement paragraph style props (both converters) + editor.js

## lists
- [ ] T9 contract test: multilevel/outline list round-trips
- [ ] T10 implement multilevel list (both converters) + editor.js

## structure
- [ ] T11 contract test: TOC / page-break / section-break / columns round-trips
- [ ] T12 implement structure elements (both converters) + editor.js

## tables
- [ ] T13 contract test: borders/shading/width-height/caption/split round-trips
- [ ] T14 implement table props (both converters) + editor.js table dialogs
- [ ] T15 contract test + UI: table insert / add row-col

## objects
- [ ] T16 contract test: image resize/wrap preserved
- [ ] T17 implement image sizing attrs (both converters) + editor.js
- [ ] T18 contract test: shape/textbox/chart/equation round-trips (HTML embed)
- [ ] T19 implement object embed (both converters) + editor.js

## links
- [ ] T20 contract test: hyperlink/bookmark/cross-reference round-trips
- [ ] T21 implement links (both converters) + editor.js link dialog

## references
- [ ] T22 contract test: footnote/endnote round-trips
- [ ] T23 implement references (both converters) + editor.js

## header-footer
- [ ] T24 contract test: header/footer/page-number round-trips
- [ ] T25 implement header/footer (both converters) + editor.js

## insert
- [ ] T26 contract test: horizontal-rule round-trips
- [ ] T27 implement symbol/date-time/hr (converters + editor.js)

## view / file / collaboration / tools (UI-only or collab)
- [ ] T28 editor.js: zoom / dark-mode / fullscreen / print-layout
- [ ] T29 editor.js: file-new / file-open / export(pdf,odt,html,docx) / print
- [ ] T30 collab.py + editor.js: comments / track-changes / version-history
- [ ] T31 editor.js: spellcheck / word-count / protect

## verification
- [ ] T32 run full suite (pytest) + ruff; all 71 functions green or UI-wired
- [ ] T33 update feature-graph status in chemie-neo4j (done/partial/missing)
