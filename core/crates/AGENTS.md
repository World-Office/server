# CORE CRATES

**Generated:** 2026-04-19 | **License:** AGPL-3.0 | **Rust edition:** 2024

## OVERVIEW

26 Rust crates implementing document format parsing, rendering, conversion, and protocol servers.

## FORMAT PARSERS (16 crates)

Each implements `FormatRoundtrip` from `wo-common/test_harness.rs`. Structure: `parser.rs` + `serializer.rs` + `roundtrip.rs`.

| Crate | Lines | Format | Notes |
|-------|-------|--------|-------|
| wo-ooxml | 2,954 | DOCX/XLSX/PPTX | Largest parser |
| wo-fb2 | 2,784 | FictionBook 2.0 | |
| wo-odf | 2,519 | ODT/ODS/ODP | ZIP + XML |
| wo-rtf | 2,032 | Rich Text Format | |
| wo-hwp | 1,454 | Korean HWP | |
| wo-ofd | 1,463 | Chinese OFD | |
| wo-xps | 1,555 | XPS | |
| wo-html | 1,682 | HTML import/export | |
| wo-msbinary | 1,817 | OLE compound→JSON | |
| wo-epub | 1,876 | EPUB (ZIP-based) | |
| wo-pdf | 2,014 | PDF read/write |
| wo-djvu | 894 | DjVu | |
| wo-txt | 882 | Plain text | |
| wo-unicode | 1,040 | Encoding (ICU) | |

## RENDERING (3 crates)

| Crate | Lines | Purpose |
|-------|-------|---------|
| wo-renderer | 4,650 | Canvas: text layout, gradients, transforms, paths, fonts, colors |
| wo-fonts | 1,155 | Font loading, caching, CSS-compliant matching |
| wo-raster | 667 | Image encode/decode (PNG, BMP) |

## CONVERSION + PROTOCOLS (4 crates)

| Crate | Lines | Purpose |
|-------|-------|---------|
| wo-x2t | 8,954 | Conversion orchestrator — 27 native converters, chain support |
| wo-docx-renderer | 2,004 | DOCX→PDF rendering pipeline |
| wo-wopi | 1,013 | WOPI server (axum: CheckFileInfo/GetFile/PutFile) |
| wo-webdav | 2,119 | WebDAV server (axum) |

## INFRASTRUCTURE (3 crates)

| Crate | Lines | Purpose |
|-------|-------|---------|
| wo-common | 1,029 | Shared types, errors, `FormatRoundtrip` test harness |
| wo-office-utils | 439 | ZIP/archive manipulation |
| wo-docserver | 756 | Document server UI + WOPI→OCIS proxy |

## WASM TARGETS (2 crates)

Cannot test with `cargo test` — need wasm-pack or browser runtime.

| Crate | Lines | Purpose |
|-------|-------|---------|
| wo-x2t-wasm | 165 | Format conversion → WASM |
| wo-renderer-wasm | 894 | Canvas rendering → WASM |

## CONVENTIONS

- See `core/AGENTS.md` for parser structure, `FormatRoundtrip` trait, and test conventions
- CI excludes `wo-pdf` and `wo-webdav` from clippy/check

## ANTI-PATTERNS

- See `core/AGENTS.md` for core-wide anti-patterns
- Zero `unsafe` blocks across all 26 crates
