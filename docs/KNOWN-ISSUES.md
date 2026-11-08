# KNOWN ISSUES — World-Office server

Triage log for long-standing breakages that cannot be fixed from a single,
narrowly-scoped change (they need source edits in crates/apps/packages that
are owned by other work items). Each entry lists the **blocker** and the
**workaround** currently in effect.

Status snapshot: swept 2026-11-08 (L2O-05) over the 2026-09-14 baseline
(main @ `7a777d89`, where `ci.yml`, `wasm.yml` and `docker.yml` were red).
Every entry below is now verified **resolved** or **historical**; no job or
step in `ci.yml` carries `continue-on-error` anymore. `deploy.yml` was green
throughout and is unaffected.

The general policy for workflow gates: jobs that fail only because of an
issue listed here carry `continue-on-error: true` plus a `KNOWN-ISSUES`
comment so the workflow stays green while the underlying fix lands in a
dedicated change. When the root cause is fixed, remove the
`continue-on-error` and the comment.

---

## 1. wo-x2t-wasm cross-compiles `uuid` without a wasm RNG feature ✅ resolved 2026-11-08

**Was affected:** `wasm.yml` → job `Build wo-x2t-wasm` (exit 101).

**Symptom (CI log, at the time):**
```
error: to use `uuid` on `wasm32-unknown-unknown`, specify a source of
randomness using one of the `js`, `rng-getrandom`, or `rng-rand` features
  --> uuid-1.23.1/src/rng.rs:104:5
error: could not compile `uuid` (lib) due to 1 previous error
```

**Resolution (verified 2026-11-08):** the fix landed in three layers and
both workspace resolutions are green now.

- Root workspace: `Cargo.toml` pins `uuid = { version = "1", features =
  ["v4", "js"] }` and `.cargo/config.toml` selects the getrandom 0.4
  `wasm_js` backend for `wasm32-unknown-unknown` (getrandom 0.4 arrives via
  msoffice-crypto → rand 0.10); `wo-x2t-wasm` additionally declares the
  wasm32-target `getrandom` dep itself.
- Nested workspace: `wasm-pack` (used by the pnpm build scripts) resolves
  from `core/`, whose `uuid` spec (`v4, serde`, no `js`) still reproduced
  the exact compile_error above with uuid 1.23.4 (verified red before this
  change). `core/Cargo.toml` is now synced to
  `uuid = { version = "1", features = ["v4", "serde", "js"] }` per its own
  keep-in-sync mandate (wo-docserver is a member of both workspaces).
- Verified: `cargo build --target wasm32-unknown-unknown -p wo-x2t-wasm`
  exits 0 from **both** the repo root and `core/`.

While re-verifying, the job's test step turned out to be a no-op:
`wasm-pack test --node -p wo-x2t-wasm` was invoked at the workspace root,
where wasm-pack dies with `failed to parse manifest … missing field
'package'` before running a single test — masked by `continue-on-error`.
The step now runs `wasm-pack test --node` with
`working-directory: core/crates/wo-x2t-wasm` (verified exit 0) and is
required again, so the job cannot silently regress.

---

## 2. pdfium guard in wo-pdf-render tests (HISTORICAL — resolved 2026-11-08 in L2O-04)

**Was affected:** `ci.yml` → job `coverage-rust` (`cargo llvm-cov --workspace
--lib`, exit 101 → job red, kept green via `continue-on-error`).

**Symptom (CI log, at the time):**
```
thread 'annotation::tests::test_parse_annotations_none' panicked at
  core/crates/wo-pdf-render/src/annotation.rs:156:45:
Pdfium not available for tests: "pdfium initialization failed:
LoadLibraryError(DlOpen { desc: \"libpdfium.so: cannot open shared object
file: No such file or directory\" ..."
...
test result: FAILED. 19 passed; 5 failed; 7 ignored
```

**Root cause (fixed):** `wo-pdf-render/build.rs` auto-downloads and caches
`libpdfium.so` under `$CARGO_HOME/pdfium-vendored/<ver>/linux-x86_64/` and
emits `cargo:rustc-env=WO_PDF_RENDER_LIB_PATH`, but nothing added that
directory to the runtime library path (`LD_LIBRARY_PATH`), so initializing
the Pdfium backend failed to `dlopen` the library.

**Fix (in effect):** `PdfiumBackend::new()` now binds to the build-time
vendored library path (absolute path, no `LD_LIBRARY_PATH` needed) with the
platform loader path as fallback, and every pdfium-backed test goes through
the `crate::test_backend_or_skip()` runtime guard, which shares one
process-global backend (pdfium allows only one binding per process and is
not thread-safe — the guard serializes pdfium-backed tests) and skips its
assertions, with a logged reason, when the pdfium runtime is unavailable.
The previously `#[ignore]`d renderer/acroform tests were un-ignored behind
the same guard. `coverage-rust` had its `continue-on-error` removed and is
required again.

---

## 3. ocis SSE TypeError in the collaboration stream (HISTORICAL — python docserver removed 2026-10-14; verified gone 2026-11-08)

**Was affected:** E2E / live integration with OpenCloud (OCIS). Never a
pinned CI gate.

**Symptom (at the time):** the editor's real-time collaboration push channel
was Server-Sent Events served by the Python docserver at
`GET /api/documents/{doc_id}/collab/stream`
(`opencloud-docserver/src/editor/router.py`, `media_type="text/event-stream"`,
seed `state` event then `ops`/`presence`/`resync` events with a
`: keepalive` heartbeat). Consumed **through the OCIS reverse proxy**,
browsers reported a `TypeError` (EventSource `event.data` handling /
proxy-buffered or re-chunked frames), so live coauth presence silently died
while the document itself kept working through the HTTP sync endpoints.

**Status (verified 2026-11-08):** the affected code no longer exists in this
tree — `opencloud-docserver` was removed on 2026-10-14 and the collab SSE
stream now lives in the Rust docserver
(`core/crates/wo-docserver/src/api_ext.rs::collab_stream`, routed at
`/api/documents/{id}/collab/stream` in `lib.rs`). The historical workaround
(sync endpoints `/api/documents/{id}/collab/text`, `sync`, `resync`) is
still the convergence path. Any proxy-framing defect against the Rust
endpoint would be a **new** issue, not this one; kept for history only.

---

## 4. rustfmt / clippy debt  ✅ resolved 2026-11-08

**Was:** `ci.yml` → job `lint-rust` (step `Check formatting` =
`cargo fmt --all -- --check` red; `Clippy -D warnings` would also be red)
on rustfmt debt in:
`core/crates/wo-docserver/src/wopi.rs`,
`core/crates/wo-renderer/src/fonts.rs`,
`core/crates/wo-renderer-wasm/src/lib.rs` (+ unit tests) and
`services/coauthoring-service/src/main.rs`.

**Resolution:** the owning source changes landed and the gate is green again
— `cargo fmt --all -- --check` and
`cargo clippy --workspace --all-targets -- -D warnings` both exit 0 on the
repo root (verified on nightly, rustfmt 1.12.0-nightly / rustc
1.101.0-nightly). `lint-rust` no longer sets `continue-on-error`, so the job
is a required gate once more.

Note for future triage: `wo-docserver`, `wo-renderer` and
`wo-renderer-wasm` pin `edition = "2021"` in their manifests, so `cargo fmt`
formats them with the 2021 *style* edition. Running
`rustfmt --edition 2024 --check` on those files still shows a diff
(import ordering, `assert!` wrapping) — that is style-edition drift, not gate
debt; it only goes away if those crates migrate to edition 2024.

---

## 5. wo-ooxml: test_roundtrip_with_formatting fails on missing underline XML ✅ resolved (verified 2026-11-08)

**Was affected:** `ci.yml` → job `test-rust-unit`
(`cargo test -p wo-ooxml --lib`, exit 101).

**Symptom (CI log, at the time):**  
`assertion failed: doc_content.contains("<w:u w:val=\"single\"/>")` in  
`roundtrip::tests::test_roundtrip_with_formatting` (file  
`core/crates/wo-ooxml/src/roundtrip.rs`).

The round-trip test created a docx with underlined text and expected the
`w:u` element to survive parse → serialize; the serializer dropped it.

**Resolution (verified 2026-11-08):** underline emission landed in
`wo-ooxml`. The test runs un-`#[ignore]`d and passes —
`cargo test -p wo-ooxml --lib` → 66 passed / 0 failed / 0 ignored
(the `roundtrip` filter alone: 11 passed, including
`test_roundtrip_with_formatting`). Neither workaround from the original
entry was ever needed on the current tree: the test is not ignored and
`test-rust-unit` carries no `continue-on-error`.

---

## 6. Biome format debt — packages/wopi-client  ✅ resolved 2026-10-05, re-verified 2026-11-08

**Was:** `ci.yml` → job `lint-ts` (`pnpm lint`, red) from a Biome format diff
in `packages/wopi-client`.

**Resolution:** ran `biome check --write` across the six red workspaces
(`wopi-client`, `editor-common`, `pdfeditor`, `presentationeditor`,
`spreadsheeteditor`, `visioeditor`) — safe format/organizeImports fixes only.
`lint-ts` no longer sets `continue-on-error`. Re-verified during the
2026-11-08 sweep: fresh `pnpm install --frozen-lockfile` +
`pnpm lint` → turbo **27/27 successful, exit 0**, zero Biome diffs.
---

## 7. docker.yml: wasm-pack missing + GHCR org-package permission ✅ resolved (fixes landed 2026-10-13; verified 2026-11-08)

**Was affected:** `.github/workflows/docker.yml` — `build-frontend` red with
`sh: 1: wasm-pack: not found` (the job never installed wasm-pack, unlike
`deploy.yml`), and `build-services` red with
`#26 ERROR: denied: installation not allowed to Create organization
package` (`secrets.GITHUB_TOKEN` lacked `write:packages` for the
`world-office` org namespace).

**Resolution (verified in-tree 2026-11-08):** both documented fixes are in
`docker.yml` — `taiki-e/install-action@wasm-pack` before the frontend build
(same as `ci.yml`/`deploy.yml`), and a workflow-level
`permissions: { contents: read, packages: write }` so the default
`GITHUB_TOKEN` login can create org packages. Deployment continues to be
served by `deploy.yml` (green).

---

## How to clear these (cheat sheet)

Sweep state 2026-11-08 (L2O-05): every row below is resolved or historical;
no `continue-on-error` remains anywhere in `ci.yml` (the two `wasm.yml`
flags are gone as well).

| Job (workflow) | Issue | Status | Fix landed in |
|---|---|---|---|
| `Build wo-x2t-wasm` (wasm.yml) | #1 uuid wasm RNG | ✅ resolved 2026-11-08 | `Cargo.toml` + `core/Cargo.toml` (uuid `js`) + wasm.yml test-step cwd |
| `coverage-rust` (ci.yml) | #2 pdfium guard | ✅ resolved 2026-11-08 (L2O-04) | `wo-pdf-render` vendored-lib binding + skip guard |
| E2E/live (not a gate) | #3 ocis SSE TypeError | historical — python docserver removed 2026-10-14 | n/a (Rust `wo-docserver` owns the stream now) |
| `lint-rust` (ci.yml) | #4 fmt/clippy debt | ✅ resolved 2026-11-08 | source fmt/clippy fixes (owning changes) |
| `test-rust-unit` (ci.yml) | #5 wo-ooxml underline roundtrip | ✅ resolved (test passes un-ignored) | `wo-ooxml` underline emission |
| `lint-ts` (ci.yml) | #6 wopi-client Biome | ✅ resolved 2026-10-05, re-verified 2026-11-08 | `biome check --write` across six workspaces |
| `build-frontend`/`build-services` (docker.yml) | #7 wasm-pack + GHCR permission | ✅ resolved 2026-10-13 | `docker.yml`: wasm-pack install + `packages: write` |
