# MEASUREMENTS.md — ADR-F1 ribbon census

## Machine-readable summary

WO_COMMIT=8268eeb0e
WASM_RAW=196248
WASM_GZ=77143
JS_RAW=33650
JS_GZ=6627
OO_ROWS=2
WO_ROWS=2
OO_GROUPS=12
WO_GROUPS=8
LAYOUT_OK=1

## Human table

| Metric | ONLYOFFICE | World-Office (Leptos) |
|--------|-------------|-------------------------|
| Rows (Home ribbon) | 2 | 2 |
| Groups (Home ribbon) | 12 | 8 |
| WASM raw size | N/A | 196248 B |
| WASM gzipped | N/A | 77143 B |
| JS raw size | N/A | 33650 B |
| JS gzipped | N/A | 6627 B |
| Layout parity | N/A | PASS |

## Verbatim layout-diff output

```
layout-diff [Home]  OO: 2 rows / 12 groups   WO: 2 rows / 8 groups   -> ok
```

## Method

- Toolchain: trunk 0.22.2 + leptos 0.8.23 (rustc 1.102.0-nightly)
- Census: census-react-deep.cjs from /home/weiss/git/World-Office/wo-test-harness/census/ running against the local build served on 127.0.0.1 (random port 8700-8799)
- Layout diff: layout-diff.py from /home/weiss/git/World-Office/wo-test-harness/census/ comparing against golden census-oo-deep.json
- Viewport: 1600x1000
- Source commit date: 2026-11-25T19:09:08+01:00
