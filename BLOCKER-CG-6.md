# BLOCKER — CG-6

**Task:** (A) `DocxBody.raw_sect_pr` verbatim · (B) wo-renderer-wasm formatting
edits clear `raw_rpr`/`raw_ppr` · (C) corpus test in `congruence_tests.rs`.

**Per the brief: nothing is committed.** The work is complete and verified
(see below), but the acceptance gate cannot fully pass from inside CG-6's
file scope because the handed baseline (HEAD `c4817ee3`) does not compile.

## What blocked me

`cargo test -p wo-renderer-wasm --lib congruence_fmt` cannot build:
wo-renderer-wasm hard-depends on `wo-ooxml-ops`, whose **lib (production
code)** fails with 12 × E0063 at baseline — *before any CG-6 change*
(verified via `git stash`; error sets identical with/without my work):

```
5 × missing field `raw_ppr` in initializer of `DocxParagraph`
5 × missing field `raw_tc_pr` in initializer of `DocxTableCell`
2 × missing fields `drawing`, `hyperlink_rid` and `raw_rpr` in initializer of `DocxRun`
     core/crates/wo-ooxml-ops/src/table.rs:20,75,177,426,486,498
     core/crates/wo-ooxml-ops/src/text.rs:297,333,341,597
     core/crates/wo-ooxml-ops/src/section.rs:33
```

These are fallout from earlier campaign commits that added model fields
(`raw_ppr`, `raw_rpr`/`drawing`/`hyperlink_rid`, `raw_tc_pr`) without
updating the struct literals in `wo-ooxml-ops` (out of CG-6 scope). One more
site hides behind it: `wo-renderer-wasm/src/selection_undo_tests.rs:10`
(missing `raw_ppr`; also out of CG-6 scope — only `lib.rs` is in scope there).

## Status of the CG-6 work (all in-scope files, uncommitted)

- **A done** — `DocxBody.raw_sect_pr: Option<String>` (`#[serde(default)]`,
  model.rs) captured verbatim in `parse_body_node` via the
  `node.range()` slice idiom (parser.rs) and re-emitted unchanged before
  `</w:body>` (serializer.rs).
- **B done** — `apply_formatting` (wo-renderer-wasm/src/lib.rs) clears
  `run.raw_rpr` when any run-level format key is present and `para.raw_ppr`
  when any paragraph-level key is present, so edits are not shadowed by the
  verbatim captures at save time.
- **C done** — `test_rich_corpus_round_trip` in `congruence_tests.rs`:
  rich docx (2 × numPr, bold+color raw rPr, hyperlink, table with tblPr,
  1 inline drawing, body sectPr) → parse → serialize; asserts `numPr >= 2`,
  `<w:drawing` count == 1, `<w:hyperlink r:id="rId7">`, `<w:tblPr>`,
  `<w:sectPr>` + verbatim `pgSz`/`pgMar`, and all 8 texts preserved.
- Bonus (in-scope, required for the gate): fixed 8 pre-existing broken
  struct literals inside `wo-renderer-wasm/src/lib.rs` itself
  (`raw_ppr`/`raw_tc_pr`/`raw_tbl_pr`/`raw_tbl_grid` additions).

## Verification evidence

With the 13-line out-of-scope remediation below applied **temporarily**
(then reverted — worktree contains only in-scope edits):

```
cargo test -p wo-ooxml --lib congruence
  → 8 passed (incl. test_rich_corpus_round_trip)          GREEN

cargo test -p wo-renderer-wasm --lib congruence_fmt
  → 1 passed (test_congruence_fmt_edits_clear_raw_captures) GREEN
```

## Follow-on breakage caused by my (sanctioned, additive) model change

`DocxBody.raw_sect_pr` breaks two out-of-scope struct-literal sites that
must gain `raw_sect_pr: None` / `..Default::default()` when CG-6 lands:

- `core/crates/wo-docx-renderer/src/layout.rs:1619` — **production code**
- `core/crates/wo-x2t/src/converters.rs` — 14 sites, test module only

Hard rule 4 declares additive `Option<...>` fields fine; these files are
missing from my scope, so they are noted here instead of a commit message
(no commit was made).

## Remediation to unblock the gate (verified green, apply as-is)

Two additional out-of-scope follow-ups my change needs:

```diff
--- a/core/crates/wo-docx-renderer/src/layout.rs
+++ b/core/crates/wo-docx-renderer/src/layout.rs
@@ -1619 +1619 @@
-            let body = DocxBody { blocks: hf.blocks.clone() };
+            let body = DocxBody { blocks: hf.blocks.clone(), raw_sect_pr: None };
```

(`wo-x2t/src/converters.rs`: add `raw_sect_pr: None,` inside each of the 14
`DocxBody {` test literals, or `..Default::default()`.)

Pre-existing baseline remediation (wo-ooxml-ops + selection_undo_tests.rs):

```diff
--- a/core/crates/wo-ooxml-ops/src/section.rs
+++ b/core/crates/wo-ooxml-ops/src/section.rs
@@ -35,6 +35,7 @@
                 properties: Default::default(),
                 runs: vec![],
                 section_properties: Some(section_props),
+                ..Default::default()
             };
--- a/core/crates/wo-ooxml-ops/src/table.rs
+++ b/core/crates/wo-ooxml-ops/src/table.rs
@@ -38 +39,2 @@
         }],
         section_properties: None,
+        ..Default::default()
@@ -25,6 +26,7 @@   (inner DocxRun literal in default_paragraph)
             all_caps: false,
+            ..Default::default()
@@ -80,6 +82,7 @@
                     shading: cell.shading.clone(),
+                    raw_tc_pr: None,
@@ -192,6 +195,7 @@
                 shading: None,
+                raw_tc_pr: None,
@@ -433,6 +437,7 @@
                         shading: None,
+                        raw_tc_pr: None,
@@ -494,6 +499,7 @@
                             shading: None,
+                            raw_tc_pr: None,
@@ -507,6 +513,7 @@
                             shading: None,
+                            raw_tc_pr: None,
--- a/core/crates/wo-ooxml-ops/src/text.rs
+++ b/core/crates/wo-ooxml-ops/src/text.rs
@@ -299,6 +299,7 @@
                 section_properties: None,
+                ..Default::default()
@@ -336,6 +337,7 @@
             section_properties: None,
+            ..Default::default()
@@ -345,6 +347,7 @@
             section_properties: None,
+            ..Default::default()
@@ -612,6 +615,7 @@
                 all_caps: run.all_caps,
+                ..Default::default()
--- a/core/crates/wo-renderer-wasm/src/selection_undo_tests.rs
+++ b/core/crates/wo-renderer-wasm/src/selection_undo_tests.rs
@@ -15,6 +15,7 @@
                 }],
                 section_properties: None,
+                raw_ppr: None,
```

## Unrelated pre-existing failures observed (outside gate filters)

- `wo-ooxml` `roundtrip::tests::test_roundtrip_with_formatting` fails at
  baseline (`assertion failed: doc_content.contains("<w:u w:val=\"single\"/>")`).
- Several `wo-renderer-wasm` PDF-model tests hang >60 s on this host at
  baseline.

## Worktree state

```
 M core/crates/wo-ooxml/src/model.rs          (A: raw_sect_pr field)
 M core/crates/wo-ooxml/src/parser.rs         (A: verbatim capture)
 M core/crates/wo-ooxml/src/serializer.rs     (A: verbatim emission + test literals)
 M core/crates/wo-ooxml/src/congruence_tests.rs (C: corpus test)
 M core/crates/wo-renderer-wasm/src/lib.rs    (B: clear raw captures + test + 8 literal fixes)
?? BLOCKER-CG-6.md
```

Apply the remediation above, re-run the gate (green), then commit the five
in-scope files as:
`feat(ooxml): verbatim body sectPr round-trip + formatting edits clear raw captures`
