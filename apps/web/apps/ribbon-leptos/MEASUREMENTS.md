# MEASUREMENTS.md — ADR-F1 ribbon census

## Machine-readable summary

WO_COMMIT=ef39c17cd
WASM_RAW=196248
WASM_GZ=77143
JS_RAW=33650
JS_GZ=6627
BUILD_S=0
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
| Build time | N/A | 0s |
| Layout parity | N/A | PASS |

## Verbatim layout-diff output

```
layout-diff [Home]  OO: 2 rows / 12 groups   WO: 2 rows / 8 groups   -> ok
```

## Method

- Toolchain: trunk trunk 0.22.2 + = 0.8.23
- Census: census-react-deep.cjs from /home/weiss/git/World-Office/wo-test-harness/census/ running against local build served at http://127.0.0.1:8797/
- Layout diff: layout-diff.py from /home/weiss/git/World-Office/wo-test-harness/census/ comparing against golden census-oo-deep.json
- Viewport: 1600x1000
- Timestamp: 2026-11-25T18:55:33Z
