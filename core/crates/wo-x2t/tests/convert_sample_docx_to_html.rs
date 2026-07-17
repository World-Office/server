use std::fs;
use std::path::PathBuf;

#[test]
fn test_sample_docx_to_html_conversion() {
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..");
    let docx_path = project_root.join("assets/templates/sample/sample.docx");

    assert!(
        docx_path.exists(),
        "sample.docx not found at {:?}",
        docx_path
    );

    let data = fs::read(&docx_path).expect(&format!("Failed to read {:?}", docx_path));
    eprintln!("Read {} bytes from sample.docx", data.len());

    let router = wo_x2t::ConversionRouter::new();

    assert!(
        router.is_supported("docx", "html"),
        "docx→html conversion should be supported"
    );

    let result = router.convert("docx", "html", &data);

    assert_eq!(
        result.status,
        wo_x2t::ConversionStatus::Success,
        "docx→html conversion failed: {:?}",
        result.error
    );

    let output = result.output.expect("Should have output on success");
    assert!(!output.data.is_empty(), "HTML output should not be empty");

    let html = String::from_utf8_lossy(&output.data);
    eprintln!(
        "✅ sample.docx→html: {} bytes in {}ms",
        output.data.len(),
        result.duration_ms
    );

    assert!(
        html.to_lowercase().contains("<!doctype html")
            || html.to_lowercase().contains("<html"),
        "Output should contain HTML document structure"
    );

    assert!(
        html.len() > 500,
        "sample.docx HTML too short: {} chars",
        html.len()
    );

    let out_path = project_root.join("target").join("x2t-sample-output.html");
    fs::write(&out_path, &output.data)
        .expect(&format!("Failed to write output to {:?}", out_path));
    eprintln!("Output written to: {:?}", out_path);
}
