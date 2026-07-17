use std::fs;
use std::path::PathBuf;

fn get_fixture_path(name: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop();
    path.push("wo-docserver");
    path.push(name);
    path
}

#[test]
fn test_docx_to_html_conversion() {
    let docx_path = get_fixture_path("demo.docx");
    assert!(docx_path.exists(), "demo.docx not found at {:?}", docx_path);

    let data = fs::read(&docx_path)
        .expect(&format!("Failed to read {:?}", docx_path));

    eprintln!("Read {} bytes from demo.docx", data.len());

    let router = wo_x2t::ConversionRouter::new();

    assert!(
        router.is_supported("docx", "html"),
        "docx→html conversion should be supported"
    );

    let path = router.conversion_path("docx", "html");
    eprintln!("Conversion path: {:?}", path);
    assert_eq!(path, vec!["docx", "html"], "Should be direct conversion");

    let result = router.convert("docx", "html", &data);

    assert_eq!(
        result.status,
        wo_x2t::ConversionStatus::Success,
        "docx→html conversion failed: {:?}",
        result.error
    );

    let output = result.output.expect("Should have output on success");
    assert!(!output.data.is_empty(), "HTML output should not be empty");
    assert_eq!(output.format, "html", "Output format should be html");

    let html = String::from_utf8_lossy(&output.data);
    eprintln!(
        "✅ docx→html conversion: {} bytes in {}ms",
        output.data.len(),
        result.duration_ms
    );

    assert!(
        html.to_lowercase().contains("<!doctype html")
            || html.to_lowercase().contains("<html"),
        "Output should contain HTML document structure"
    );

    assert!(
        html.len() > 100,
        "HTML output seems too short: {} chars",
        html.len()
    );

    let out_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("target")
        .join("x2t-docx-to-html-output.html");
    fs::write(&out_path, &output.data)
        .expect(&format!("Failed to write output to {:?}", out_path));
    eprintln!("Output written to: {:?}", out_path);
}
