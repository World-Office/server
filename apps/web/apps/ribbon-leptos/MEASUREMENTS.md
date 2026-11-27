# MEASUREMENTS.md — ADR-F1 ribbon census

## Machine-readable summary

WO_COMMIT=8268eeb0
WASM_RAW=5087212
WASM_GZ=2030458
JS_RAW=120448
JS_GZ=19132
OO_ROWS=2
WO_ROWS=2
OO_GROUPS=12
WO_GROUPS=11
LAYOUT_OK=1

## Human table

| Metric | ONLYOFFICE | World-Office (Leptos) |
|--------|-------------|-------------------------|
| Rows (Home ribbon) | 2 | 2 |
| Groups (Home ribbon) | 12 | 11 |
| WASM raw size | N/A | 5087212 B |
| WASM gzipped | N/A | 2030458 B |
| JS raw size | N/A | 120448 B |
| JS gzipped | N/A | 19132 B |
| Layout parity | N/A | PASS |

## Verbatim layout-diff output

```
layout-diff [Home]  OO: 2 rows / 12 groups   WO: 2 rows / 11 groups   -> ok
```

## Method

- Toolchain: trunk 0.22.2 + leptos 0.8.23 (rustc 1.102.0-nightly)
- Census: census-react-deep.cjs from /home/weiss/git/World-Office/wo-test-harness/census/ running against the local build served on 127.0.0.1 (random port 8700-8799)
- Layout diff: layout-diff.py from /home/weiss/git/World-Office/wo-test-harness/census/ comparing against golden census-oo-deep.json
- Viewport: 1600x1000
- Source commit date: 2026-11-25T19:09:08+01:00
