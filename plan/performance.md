# Performance Baseline

> **Last updated:** 2026-07-18
>
> Baseline metrics for World-Office services and frontends. Values marked with
> `(estimate)` are placeholders awaiting production measurement.
> Values marked with `(measured)` are recorded from the current system.

---

## 1. App Startup

| Metric | Value | Notes |
|--------|-------|-------|
| Cold start — coauthoring-service | ~450 ms (estimate) | Rust binary, SQLite init + axum startup |
| Cold start — identity-service | ~350 ms (estimate) | Axum + JWT key loading |
| Cold start — storage-service | ~400 ms (estimate) | SQLite + disk enumeration |
| Cold start — conversion-service | ~800 ms (estimate) | Loads format conversion chains + WASM |
| Cold start — api-gateway | ~300 ms (estimate) | Routing table init |
| Cold start — session-service | ~350 ms (estimate) | Axum + Redis client init |
| Warm start (all services) | ~150 ms (estimate) | After first request JIT/cache warmup |

## 2. Document Load Time

| File Size | Category | Editor | Load Time |
|-----------|----------|--------|-----------|
| < 10 KB | Small | documenteditor-react | ~200 ms (estimate) |
| 10 KB – 100 KB | Small | documenteditor-react | ~500 ms (estimate) |
| 100 KB – 1 MB | Medium | documenteditor-react | ~1,500 ms (estimate) |
| 1 MB – 10 MB | Large | documenteditor-react | ~4,000 ms (estimate) |
| < 10 KB | Small | spreadsheeteditor-react | ~300 ms (estimate) |
| 10 KB – 100 KB | Small | spreadsheeteditor-react | ~800 ms (estimate) |
| 100 KB – 1 MB | Medium | spreadsheeteditor-react | ~2,000 ms (estimate) |
| < 10 KB | Small | presentationeditor-react | ~250 ms (estimate) |
| 10 KB – 100 KB | Small | presentationeditor-react | ~600 ms (estimate) |
| < 1 MB | Small | pdfeditor-react | ~400 ms (estimate) |
| 1 MB – 10 MB | Medium | pdfeditor-react | ~2,000 ms (estimate) |
| > 10 MB | Large | pdfeditor-react | ~6,000 ms (estimate) |

Notes:
- Load time measured from editor mount to first content render (client-side).
- Server-side conversion (e.g., OOXML to editor format) adds 200–2,000 ms depending on file complexity.
- WASM-based rendering adds ~150 ms for initial binary load and compilation.

## 3. CRDT Operation Latency

| Operation | Ops | Latency (mean) | Notes |
|-----------|-----|----------------|-------|
| Insert (local) | 100 chars | ~5 µs (measured) | Single agent, position 0 |
| Insert (local) | 1,000 chars | ~40 µs (measured) | Single agent, position 0 |
| Insert (local) | 10,000 chars | ~400 µs (measured) | Single agent, position 0 |
| Delete (small batch) | 10 ops | ~8 µs (measured) | 5-char deletes, 100 total |
| Delete (large batch) | 500 char range | ~5 µs (measured) | Single delete of 3,500 chars |
| Merge/sync | 2 replicas, 500 chars each | ~60 µs (measured) | Divergent edits merged |
| Merge/sync | 2 replicas, 5,000 chars each | ~900 µs (measured) | Large divergent merge |
| 3-way merge | 3 replicas, 1 char each | ~20 µs (measured) | Concurrent insert at same position |
| Encode (5 KB doc) | — | ~3 µs (measured) | Full oplog serialization |
| Decode (5 KB doc) | — | ~15 µs (measured) | Full oplog deserialization |
| Insert (remote, WebSocket) | 100 chars | ~15 ms (estimate) | Network round-trip included |
| Insert (remote, WebSocket) | 1,000 chars | ~20 ms (estimate) | Network + serialization |

Measured on: Intel i7-12700H @ 2.70 GHz, 32 GB RAM, Linux.

## 4. WASM Binary Sizes

| Crate | Size (KB) | Size (MB) | Notes |
|-------|-----------|-----------|-------|
| wo-x2t-wasm | ~1,200 KB (measured) | ~1.17 MB | Format conversion engine |
| wo-renderer-wasm | ~400 KB (estimate) | ~0.39 MB | Canvas rendering |
| wo-x2t-wasm (wasm-pack pkg) | ~1,400 KB (measured) | ~1.37 MB | Includes JS bindings |

**Compile times:**
| Crate | Debug | Release |
|-------|-------|---------|
| wo-x2t-wasm | ~45 s | ~120 s (estimate) |
| wo-renderer-wasm | ~20 s | ~45 s (estimate) |

**Size budget per editor target:** <1.5 MB combined WASM payload (initial load).

## 5. Bundle Sizes

| Editor | Entry Total | Total Bundle | Notes |
|--------|-------------|--------------|-------|
| documenteditor-react | ~4.5 MB (estimate) | ~6.0 MB (estimate) | Primary editor |
| spreadsheeteditor-react | ~5.0 MB (estimate) | ~6.5 MB (estimate) | Spreadsheet editor |
| presentationeditor-react | ~3.5 MB (estimate) | ~4.5 MB (estimate) | Slides editor |
| pdfeditor-react | ~2.0 MB (estimate) | ~3.0 MB (estimate) | PDF viewer/editor |
| editor-shell | ~1.0 MB (estimate) | ~1.5 MB (estimate) | Shell wrapper |

**Target:** Entry chunk < 10 MB per editor. CI fails if any editor exceeds 12 MB.

## 6. Editor Memory Usage

| Editor | Baseline | With 100-page doc | Notes |
|--------|----------|-------------------|-------|
| documenteditor-react | ~80 MB (estimate) | ~150 MB (estimate) | DOM + CRDT state |
| spreadsheeteditor-react | ~90 MB (estimate) | ~200 MB (estimate) | Cell data model |
| presentationeditor-react | ~70 MB (estimate) | ~120 MB (estimate) | Slide + shape state |
| pdfeditor-react | ~60 MB (estimate) | ~180 MB (estimate) | Rendered pages |
| coauthoring-service | ~25 MB (estimate) | ~50 MB (estimate) | Per active session |

Measured as Resident Set Size (RSS) after GC stabilization.

## 7. Format Conversion Throughput

| Conversion | Small files (<10 KB) | Medium (100 KB) | Large (1 MB) | Notes |
|------------|---------------------|------------------|---------------|-------|
| DOCX → Editor JSON | ~200 docs/s (estimate) | ~50 docs/s (estimate) | ~5 docs/s (estimate) | wo-ooxml → wo-x2t |
| ODP → Editor JSON | ~150 docs/s (estimate) | ~40 docs/s (estimate) | ~4 docs/s (estimate) | ZIP + XML parse |
| ODS → Editor JSON | ~120 docs/s (estimate) | ~30 docs/s (estimate) | ~3 docs/s (estimate) | Cell-heavy overhead |
| PDF → Editor JSON | ~80 docs/s (estimate) | ~20 docs/s (estimate) | ~2 docs/s (estimate) | Layout analysis |
| RTF → Editor JSON | ~300 docs/s (estimate) | ~80 docs/s (estimate) | ~8 docs/s (estimate) | Simple text format |
| TXT → Editor JSON | ~1,000 docs/s (estimate) | ~200 docs/s (estimate) | ~20 docs/s (estimate) | Fastest path |
| DOCX → PDF | ~100 docs/s (estimate) | ~25 docs/s (estimate) | ~3 docs/s (estimate) | Full pipeline |

## 8. API Response Times

| Endpoint | p50 | p95 | p99 | Notes |
|----------|-----|-----|-----|-------|
| GET /health (any service) | ~2 ms (estimate) | ~5 ms (estimate) | ~10 ms (estimate) | No DB |
| POST /sessions | ~5 ms (estimate) | ~15 ms (estimate) | ~30 ms (estimate) | SQLite write |
| POST /sessions/{id}/join | ~5 ms (estimate) | ~15 ms (estimate) | ~30 ms (estimate) | SQLite update |
| GET /sessions/{id} | ~3 ms (estimate) | ~10 ms (estimate) | ~20 ms (estimate) | SQLite read |
| GET /sessions (list) | ~5 ms (estimate) | ~15 ms (estimate) | ~25 ms (estimate) | SQLite query |
| WebSocket connect (/ws/{id}) | ~10 ms (estimate) | ~25 ms (estimate) | ~50 ms (estimate) | Upgrade + state init |
| WebSocket edit broadcast | ~5 ms (estimate) | ~15 ms (estimate) | ~30 ms (estimate) | In-memory channel |
| POST /files (storage-service) | ~8 ms (estimate) | ~25 ms (estimate) | ~50 ms (estimate) | SQLite + disk write |
| GET /files (list) | ~4 ms (estimate) | ~12 ms (estimate) | ~20 ms (estimate) | SQLite query |
| GET /files/{id}/content | ~3 ms (estimate) | ~10 ms (estimate) | ~20 ms (estimate) | Disk read |

## Measurement Methodology

- **CPU:** Intel i7-12700H (14 cores, 20 threads) @ 2.70 GHz
- **RAM:** 32 GB DDR5
- **Storage:** NVMe SSD
- **OS:** Linux (kernel 6.x)
- **Rust toolchain:** nightly (as specified in `rust-toolchain.toml`)
- **CRDT benchmarks:** Criterion.rs with sample_size=50 (insert/delete/encode) and sample_size=30 (merge)
- **API benchmarks:** Estimated from typical axum/sqlite performance profiles

> **Note:** Production metrics should be collected with Prometheus + Grafana
> (see `observability/`) once the system is deployed. All `(estimate)` values
> should be updated with real measurements from production traffic.
