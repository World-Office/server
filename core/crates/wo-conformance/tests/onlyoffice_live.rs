//! Live integration against a running OnlyOffice Document Server.
//!
//! Run with a pinned DS container:
//!
//! ```sh
//! docker run -d --name oo-oracle -p 9980:80 \
//!   -e JWT_ENABLED=true -e JWT_SECRET=devsecret onlyoffice/documentserver:<pinned-digest>
//! OO_DS_URL=http://127.0.0.1:9980 OO_DS_JWT=devsecret \
//!   cargo test -p wo-conformance --test onlyoffice_live -- --ignored
//! ```
//!
//! `OO_DS_PUBLIC_HOST` must be the address the DS container uses to reach this
//! test's file host (default 127.0.0.1; on docker use the bridge IP, e.g.
//! 172.17.0.1).

use std::io::Write;
use std::time::Duration;

use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use wo_conformance::{DsConfig, OnlyOfficePdfEngine, PopplerSource, RenderEngine, RenderSpec};

/// Minimal DOCX: [Content_Types], rels, and one paragraph of body text.
fn minimal_docx(paragraph: &str) -> Vec<u8> {
    let mut zip = ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts = SimpleFileOptions::default();
    zip.start_file("[Content_Types].xml", opts).unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
    )
    .unwrap();
    zip.start_file("_rels/.rels", opts).unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
    )
    .unwrap();
    zip.start_file("word/document.xml", opts).unwrap();
    zip.write_all(
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p></w:body>
</w:document>"#
        )
        .as_bytes(),
    )
    .unwrap();
    zip.finish().unwrap().into_inner()
}

#[test]
#[ignore = "requires a running OnlyOffice Document Server (see module docs)"]
fn onlyoffice_converts_and_projects() {
    let ds_url = std::env::var("OO_DS_URL").expect("OO_DS_URL not set");
    let mut cfg = DsConfig::new(ds_url);
    if let Ok(secret) = std::env::var("OO_DS_JWT") {
        cfg.jwt_secret = Some(secret);
    }
    if let Ok(host) = std::env::var("OO_DS_PUBLIC_HOST") {
        cfg.public_host = host;
    }
    cfg.timeout = Duration::from_secs(180);

    let engine =
        OnlyOfficePdfEngine::new(cfg, Box::new(PopplerSource::new().unwrap()), "pinned").unwrap();
    let render = engine
        .render(
            &minimal_docx("The oracle sees bold ideas."),
            &RenderSpec::default(),
        )
        .unwrap();

    assert_eq!(render.metadata.engine, "onlyoffice-documentserver");
    assert!(!render.pages.is_empty(), "at least one page projected");
    let texts: Vec<&str> = render.pages[0]
        .boxes
        .iter()
        .flat_map(|b| b.runs.iter().map(|r| r.text.as_str()))
        .collect();
    let joined = texts.join(" ");
    assert!(
        joined.contains("The") && joined.contains("oracle"),
        "projected text should contain the paragraph, got: {joined:?}"
    );
}
