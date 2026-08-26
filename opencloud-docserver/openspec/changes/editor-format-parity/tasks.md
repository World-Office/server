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
- [x] T7 contract test: line-spacing/indent/spacing/rtl/page-break-before round-trips — `test_html_to_docx_paragraph_props_roundtrip` + `test_html_to_odt_paragraph_props_roundtrip` (all six props); blockquote→indent test.
- [x] T8 implement paragraph style props (both converters) + editor.js — DOCX: `_para_style_parts`/`_apply_para_props` (line-space multiple via VALUE not rule — python-docx labels 1.5 as ONE_POINT_FIVE; w:bidi/w:pageBreakBefore/w:ind/w:spacing; `<blockquote>`→24pt left indent). ODT: `_build_para_resolver` + `_para_css` (fo:line-height %↔multiple, margins/indent via fo:margin-*, `style:writing-mode` rtl, fo:break-before) + writer `para_style(props)` preserving `WO_Center`/`WO_Right` names. UI: `directionRtl` toggle on blocks (parity with applyLineHeight — which now round-trips line-height instead of silently dropping it) + `RTL` toolbar button. E2E `test_paragraph_rtl_and_line_spacing_roundtrip`.

## lists
- [x] T9 contract test: multilevel/outline list round-trips — `test_html_to_docx_nested_list_roundtrip`, `test_html_to_docx_nested_numbered_list_roundtrip`, `test_html_to_odt_nested_list_roundtrip`, `test_html_to_odt_nested_numbered_list_roundtrip`.
- [x] T10 implement multilevel lists (both converters) + editor.js — canonical HTML contract is NESTED `<ul>/<ol>`; DOCX stores outline level as built-in styles "List Bullet/Number [n]" (`_emit_list_tree`/`_list_level` + `_list_run_tree` grouping turns the flat style lines back into nested HTML); ODT builds nested `text:list` under the parent `text:list-item` (`_build_list`). Shared `parse_list_at`/`extract_sublists` recursive parser replaces the regex block_re on both writers (fixes nesting + sibling lists + interleaved order via `_tokenize_body`). Tab/Shift-Tab inside a list item runs native execCommand indent/outdent (undoable, round-trips exactly). Sanitizer `_normalize_block_structure` lifts block-in-`<p>` and re-nests a `<ul>` sitting beside an `<li>` (Chromium Tab quirk) — real data-loss guard. E2E `test_nested_list_tab_indent_roundtrip`.

## structure
- [x] T11 contract test: page-break round-trips — DOCX (`test_html_to_docx_hr_and_page_break_roundtrip`) + ODT (`test_html_to_odt_page_break_roundtrip`, `test_odt_page_break_is_break_before_paragraph`). TOC / section-break / columns remain OPEN (no `<w:fldSimple>`/`w:cols` mapping in either converter yet — deferred).
- [x] T12 implement page-break in both converters — ODT: `<div class="page-break">` → empty paragraph with `fo:break-before="page"` (writer `add_page_break`, shared WO_PageBreak style); reader emits the DOCX-contract marker for an EMPTY break-before paragraph (`<div class="page-break"><br></div>`). editor.js page-break insert already exists.

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
- [x] T20 contract test: hyperlink round-trips — DOCX (pre-existing) + ODT (`test_html_to_odt_hyperlink_roundtrip`); REGRESSION tests for link boundaries both formats (`test_html_to_docx_link_boundaries_preserved`, `test_html_to_odt_link_boundaries_preserved`). Bookmarks/cross-references use w:anchor/`#frag` hrefs (DOCX `w:anchor` read; `#` hrefs preserved as-is in both converters) — partial.
- [x] T21 implement links — ODT writer now emits `text:a` hyperlinks (`A(href, type="simple")`, xlink attrs; the `_InlineRunBuilder` tracks `href` via `_inline_href` safe-scheme filter + `_flush()` at `<a>` start so leading text is NOT swallowed into the anchor — this was a real DOCX+ODT bug where `<p>See <a>site</a></p>` round-tripped as `<p><a>See site</a></p>`). Link dialog already exists.

## references
- [ ] T22 contract test: footnote/endnote round-trips
- [ ] T23 implement references (both converters) + editor.js

## header-footer
- [ ] T24 contract test: header/footer/page-number round-trips
- [ ] T25 implement header/footer (both converters) + editor.js

## insert
- [x] T26 contract test: horizontal-rule round-trips — DOCX already green; ODT now `test_html_to_odt_hr_roundtrip` + `test_odt_hr_is_bottom_border_paragraph` (both directions); literal symbol/date chars round-trip by construction (`test_special_symbol_roundtrips_docx`, `test_special_symbol_and_date_roundtrip_odt`).
- [x] T27 implement symbol/date-time/hr (converters + editor.js) — ODT `add_hr()` writes an empty paragraph styled `fo:border-bottom`; the reader detects a bottom-border-only EMPTY paragraph (`_raw_attr` reads FO attrs, incl. hyphenated border-bottom) and emits `<hr/>` — mirror of the DOCX heuristic. `btn-datetime` button + `insertDate` command (ISO date via execCommand insertText, structural-marker guard like insertSymbol). E2E `test_insert_hr_pagebreak_symbol` extended with the date.

## view / file / collaboration / tools (UI-only or collab)
- [ ] T28 editor.js: zoom / dark-mode / fullscreen / print-layout
- [ ] T29 editor.js: file-new / file-open / export(pdf,odt,html,docx) / print
- [ ] T30 collab.py + editor.js: comments / track-changes / version-history
- [ ] T31 editor.js: spellcheck / word-count / protect

## verification
- [ ] T32 run full suite (pytest) + ruff; all 71 functions green or UI-wired
- [ ] T33 update feature-graph status in chemie-neo4j (done/partial/missing)
