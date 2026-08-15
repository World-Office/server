//! build.rs — downloads and caches pdfium binaries for wo-pdf-render.
//!
//! ## Native targets (not wasm32)
//!
//! Resolution order (first match wins):
//!   1. `PDFIUM_STATIC_LIB_PATH` — explicit path to a static `libpdfium.a`
//!      (user-managed; typically from a custom pdfium build).
//!   2. `PDFIUM_BINDINGS_LIBRARY_PATH` — explicit path to a shared library
//!      (user-managed).
//!   3. Auto-download from [bblanchon/pdfium-binaries], cached under
//!      `$CARGO_HOME/pdfium-vendored/{version}/{os}-{arch}/`.
//!      Override cache root with `PDFIUM_VENDORED_CACHE_DIR`.
//!
//! [bblanchon/pdfium-binaries]: https://github.com/bblanchon/pdfium-binaries
//!
//! The downloaded library is **not** linked at compile time (pdfium-render's
//! own build.rs handles static linking when `PDFIUM_STATIC_LIB_PATH` is set).
//! This script only ensures the library is available on disk and prints its
//! location so the caller can set `LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH`
//! / `PATH` at runtime.
//!
//! ## WASM target (wasm32)
//!
//! Checks for a vendored Pdfium WASM module at:
//!   `core/crates/wo-pdf-render/vendor/pdfium-wasm/pdfium.wasm`
//!
//! If not present, prints build instructions. The Rust WASM code does NOT
//! statically link pdfium; instead it loads the external WASM module via
//! `wasm-bindgen` at runtime (pdfium-render's built-in wasm32 path).

use std::path::{Path, PathBuf};

// Keep in sync with the `pdfium_latest` feature in Cargo.toml.
const PDFIUM_VERSION: &str = "7881";
const BASE_URL: &str = "https://github.com/bblanchon/pdfium-binaries/releases/download";

// ── Platform metadata ────────────────────────────────────────────────────

struct PlatformBundle {
    archive_name: &'static str,
    lib_path_in_archive: &'static str,
    lib_name: &'static str,
}

fn detect_platform(os: &str, arch: &str) -> Result<PlatformBundle, String> {
    match (os, arch) {
        ("macos", "aarch64") => Ok(PlatformBundle {
            archive_name: "pdfium-mac-arm64.tgz",
            lib_path_in_archive: "lib/libpdfium.dylib",
            lib_name: "libpdfium.dylib",
        }),
        ("macos", "x86_64") => Ok(PlatformBundle {
            archive_name: "pdfium-mac-x64.tgz",
            lib_path_in_archive: "lib/libpdfium.dylib",
            lib_name: "libpdfium.dylib",
        }),
        ("linux", "x86_64") => Ok(PlatformBundle {
            archive_name: "pdfium-linux-x64.tgz",
            lib_path_in_archive: "lib/libpdfium.so",
            lib_name: "libpdfium.so",
        }),
        ("linux", "aarch64") => Ok(PlatformBundle {
            archive_name: "pdfium-linux-arm64.tgz",
            lib_path_in_archive: "lib/libpdfium.so",
            lib_name: "libpdfium.so",
        }),
        ("windows", "x86_64") => Ok(PlatformBundle {
            archive_name: "pdfium-win-x64.tgz",
            lib_path_in_archive: "bin/pdfium.dll",
            lib_name: "pdfium.dll",
        }),
        ("windows", "aarch64") => Ok(PlatformBundle {
            archive_name: "pdfium-win-arm64.tgz",
            lib_path_in_archive: "bin/pdfium.dll",
            lib_name: "pdfium.dll",
        }),
        _ => Err(format!(
            "wo-pdf-render: unsupported target {os}/{arch}.\n\
             Supported: macos/aarch64|x86_64, linux/x86_64|aarch64, \
             windows/x86_64|aarch64.\n\
             Set PDFIUM_BINDINGS_LIBRARY_PATH or PDFIUM_STATIC_LIB_PATH to \
             provide a custom library."
        )),
    }
}

// ── Cache directory ─────────────────────────────────────────────────────

fn cache_dir(os: &str, arch: &str) -> PathBuf {
    if let Ok(v) = std::env::var("PDFIUM_VENDORED_CACHE_DIR") {
        return PathBuf::from(v)
            .join(PDFIUM_VERSION)
            .join(format!("{os}-{arch}"));
    }

    let cargo_home = std::env::var("CARGO_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir());
            home.join(".cargo")
        });

    cargo_home
        .join("pdfium-vendored")
        .join(PDFIUM_VERSION)
        .join(format!("{os}-{arch}"))
}

// ── Download helper ───────────────────────────────────────────────────────

fn download(url: &str, dest: &Path) {
    println!(
        "cargo:warning=wo-pdf-render: downloading {} (chromium/{PDFIUM_VERSION})…",
        url.rsplit('/').next().unwrap_or(url)
    );

    let result = std::process::Command::new("curl")
        .args([
            "-L",
            "-f",
            "-s",
            "--retry",
            "3",
            "-o",
            &dest.to_string_lossy(),
            url,
        ])
        .status();

    match result {
        Ok(s) if s.success() => return,
        Ok(s) => {
            println!("cargo:warning=wo-pdf-render: curl exited {s}, trying wget…")
        }
        Err(e) => {
            println!("cargo:warning=wo-pdf-render: curl unavailable ({e}), trying wget…")
        }
    }

    let wget = std::process::Command::new("wget")
        .args(["-q", "-O", &dest.to_string_lossy(), url])
        .status();

    if matches!(wget, Ok(s) if s.success()) {
        return;
    }

    panic!(
        "\n\
         wo-pdf-render: failed to auto-download pdfium.\n\
         Both curl and wget failed.\n\n\
         Quick fix — download manually and set:\n\
           export PDFIUM_BINDINGS_LIBRARY_PATH=/path/to/libpdfium\n\n\
         Pre-built libraries (chromium/{PDFIUM_VERSION}):\n\
           {BASE_URL}/chromium%2F{PDFIUM_VERSION}"
    );
}

// ── Extraction helper ─────────────────────────────────────────────────────

fn extract_lib(tgz_path: &Path, lib_path_in_archive: &str, dest: &Path) {
    let file = std::fs::File::open(tgz_path)
        .unwrap_or_else(|e| panic!("wo-pdf-render: cannot open {}: {e}", tgz_path.display()));
    let gz = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(gz);

    for entry_result in archive
        .entries()
        .expect("wo-pdf-render: failed to iterate tar archive")
    {
        let mut entry = entry_result.expect("wo-pdf-render: failed to read tar entry");
        let path = entry
            .path()
            .expect("wo-pdf-render: invalid tar entry path")
            .to_path_buf();

        if path.to_str() == Some(lib_path_in_archive) {
            entry.unpack(dest).unwrap_or_else(|e| {
                panic!("wo-pdf-render: failed to extract '{lib_path_in_archive}': {e}")
            });
            return;
        }
    }

    panic!(
        "wo-pdf-render: '{lib_path_in_archive}' not found in '{}'.\n\
         The upstream archive layout may have changed.\n\
         Set PDFIUM_BINDINGS_LIBRARY_PATH to provide the library manually.",
        tgz_path.display()
    );
}

// ── Native resolution ────────────────────────────────────────────────────

fn resolve_native(os: &str, arch: &str) -> PathBuf {
    // Check user-provided paths first.
    if let Ok(p) = std::env::var("PDFIUM_STATIC_LIB_PATH")
        && !p.is_empty()
    {
        println!("cargo:warning=wo-pdf-render: using PDFIUM_STATIC_LIB_PATH={p}");
        return PathBuf::from(p);
    }

    if let Ok(p) = std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH")
        && !p.is_empty()
    {
        println!("cargo:warning=wo-pdf-render: using PDFIUM_BINDINGS_LIBRARY_PATH={p}");
        return PathBuf::from(p);
    }

    // Auto-download.
    let bundle = detect_platform(os, arch).unwrap_or_else(|e| panic!("{e}"));

    let dir = cache_dir(os, arch);
    let cached = dir.join(bundle.lib_name);

    if cached.exists() {
        println!(
            "cargo:warning=wo-pdf-render: cache hit — {} for {os}/{arch}",
            bundle.lib_name
        );
        return cached;
    }

    // Cache miss: download + extract.
    std::fs::create_dir_all(&dir).unwrap_or_else(|e| {
        panic!(
            "wo-pdf-render: failed to create cache dir {}: {e}",
            dir.display()
        )
    });

    let url = format!(
        "{BASE_URL}/chromium%2F{PDFIUM_VERSION}/{}",
        bundle.archive_name
    );
    let tgz = dir.join(bundle.archive_name);

    download(&url, &tgz);
    extract_lib(&tgz, bundle.lib_path_in_archive, &cached);

    // Clean up compressed archive.
    let _ = std::fs::remove_file(&tgz);

    println!(
        "cargo:warning=wo-pdf-render: cached {} at {}",
        bundle.lib_name,
        cached.display()
    );

    cached
}

// ── WASM vendored path ───────────────────────────────────────────────────

fn check_wasm_vendor() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let vendor_dir = PathBuf::from(manifest_dir)
        .join("vendor")
        .join("pdfium-wasm");

    let wasm_file = vendor_dir.join("pdfium.wasm");
    if wasm_file.exists() {
        println!(
            "cargo:warning=wo-pdf-render: vendored pdfium WASM found at {}",
            wasm_file.display()
        );
    } else {
        println!(
            "cargo:warning=wo-pdf-render: no vendored pdfium WASM at {}",
            wasm_file.display()
        );
        println!(
            "cargo:warning=wo-pdf-render: to vendor pdfium for WASM, build pdfium \
             with Emscripten and place the output .wasm file at:"
        );
        println!("cargo:warning=wo-pdf-render:   {}", wasm_file.display());
        println!(
            "cargo:warning=wo-pdf-render: the build will succeed (WASM bindings \
             compile), but runtime loading will fail without the module."
        );
    }
}

// ── Entry point ──────────────────────────────────────────────────────────

fn main() {
    println!("cargo:rerun-if-env-changed=PDFIUM_STATIC_LIB_PATH");
    println!("cargo:rerun-if-env-changed=PDFIUM_BINDINGS_LIBRARY_PATH");
    println!("cargo:rerun-if-env-changed=PDFIUM_VENDORED_CACHE_DIR");

    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();

    if target_arch == "wasm32" {
        check_wasm_vendor();
        return;
    }

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    let lib_path = resolve_native(&target_os, &target_arch);

    // Emit a `rustc-env` so the Rust source can discover the library
    // location at compile time (e.g. for embedding or printing a helpful
    // message at startup).
    println!(
        "cargo:rustc-env=WO_PDF_RENDER_LIB_PATH={}",
        lib_path.display()
    );
    println!("cargo:rerun-if-changed={}", lib_path.display());
}
