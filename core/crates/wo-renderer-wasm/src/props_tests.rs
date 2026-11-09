//! Tests for the props module (PORT-PLAN D2 / ORM-03): the camelCase
//! serde wire contract of the `Wasm*` blobs, model round-trips through
//! `set_property`/`get_property` at the document cursor, verbatim
//! capture congruence, stored kinds, and error paths.
//! Registered via `#[cfg(test)] mod props_tests;`.

#[cfg(test)]
use super::*;
#[cfg(test)]
use super::props::*;
#[cfg(test)]
use wo_ooxml::model::{
    DocxBorder, LineSpacingRule, TabStopKind, TextAlignment, UnderlineType, VerticalAlignment,
};

fn run(text: &str) -> DocxRun {
    DocxRun {
        text: text.to_string(),
        ..Default::default()
    }
}

fn para(text: &str) -> DocxParagraph {
    DocxParagraph {
        style_id: None,
        properties: DocxParagraphProperties::default(),
        runs: vec![run(text)],
        section_properties: None,
        raw_ppr: None,
        raw_flds: Vec::new(),
    }
}

/// Inject a model-backed document (no layout) at a fixed handle and park
/// the cursor at paragraph 0, char 0.
fn inject(handle: u32, body: DocxBody) {
    let doc = OoxmlDocument {
        format: wo_ooxml::model::OoxmlFormat::Unknown,
        version: "1.0".to_string(),
        content_types: Vec::new(),
        main_part: None,
        shared_strings: Vec::new(),
        part_count: 0,
        core_properties: Default::default(),
        relationships: Vec::new(),
        docx_body: Some(body),
        xlsx_workbook: None,
    };
    DOC_MODEL_STORE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap()
        .insert(handle, doc);
    set_cursor(handle, CursorPos::default());
}

fn simple_body(text: &str) -> DocxBody {
    let mut body = DocxBody::default();
    body.blocks.push(DocxBlock::Paragraph(para(text)));
    body
}

fn json(s: &str) -> serde_json::Value {
    serde_json::from_str(s).expect("valid JSON in test")
}

// ── serde wire contract (ORM-03: camelCase = OO asc_getX/putX schema) ──

#[test]
fn props_wasm_color_serde_camel_case() {
    let color = WasmColor {
        kind: WasmColorKind::Srgb,
        hex: Some("#FF8000".to_string()),
        rgba: Some([255, 128, 0, 255]),
        scheme_id: None,
        mods: vec![WasmColorMod {
            modifier: "brightness".to_string(),
            factor: 0.5,
        }],
    };
    let v = json(&serde_json::to_string(&color).unwrap());
    assert_eq!(v["kind"], "srgb");
    assert_eq!(v["hex"], "#FF8000");
    assert_eq!(v["rgba"], json("[255, 128, 0, 255]"));
    assert_eq!(v["mods"][0]["modifier"], "brightness");
    assert_eq!(v["mods"][0]["factor"], 0.5);
    // Sparse serialization: None fields are omitted, not nulled.
    assert!(v.get("schemeId").is_none());

    let back: WasmColor = serde_json::from_value(v).unwrap();
    assert_eq!(back, color);

    // "auto" color is the OO wire default spelling.
    let auto = json(&serde_json::to_string(&WasmColor::default()).unwrap());
    assert_eq!(auto["kind"], "srgb", "default kind is srgb");
    let parsed: WasmColor = serde_json::from_str(r#"{"kind":"auto"}"#).unwrap();
    assert_eq!(parsed.kind, WasmColorKind::Auto);
}

#[test]
fn props_wasm_paragraph_property_serde_camel_case() {
    let p = WasmParagraphProperty {
        alignment: Some(WasmTextAlignment::Justify),
        ind_left: Some(720),
        spacing_before: Some(120),
        spacing_line_rule: Some(WasmLineSpacingRule::OnePointFive),
        keep_next: Some(true),
        num_id: Some(3),
        ilvl: Some(1),
        tabs: Some(vec![WasmTabStop {
            pos: 1440,
            align: WasmTabStopAlign::Right,
            leader: Some("dot".to_string()),
        }]),
        shd: Some(WasmParagraphShd {
            fill: Some("#EEEEEE".to_string()),
            ..Default::default()
        }),
        borders: Some(WasmTextBorders {
            bottom: Some(WasmBorder {
                style: WasmBorderStyle::Single,
                size: 8,
                space: 1,
                color: "0000FF".to_string(),
            }),
            ..Default::default()
        }),
        can_add_table: Some(true),
        ..Default::default()
    };
    let v = json(&serde_json::to_string(&p).unwrap());
    assert_eq!(v["alignment"], "justify");
    assert_eq!(v["indLeft"], 720);
    assert_eq!(v["spacingBefore"], 120);
    assert_eq!(v["spacingLineRule"], "onePointFive");
    assert_eq!(v["keepNext"], true);
    assert_eq!(v["numId"], 3);
    assert_eq!(v["ilvl"], 1);
    assert_eq!(v["tabs"][0]["pos"], 1440);
    assert_eq!(v["tabs"][0]["align"], "right");
    assert_eq!(v["shd"]["fill"], "#EEEEEE");
    assert_eq!(v["borders"]["bottom"]["style"], "single");
    assert_eq!(v["canAddTable"], true);
    // Unset model-backed fields are omitted.
    assert!(v.get("indRight").is_none());
    assert!(v.get("widowControl").is_none());

    let back: WasmParagraphProperty = serde_json::from_value(v).unwrap();
    assert_eq!(back, p);
}

#[test]
fn props_wasm_border_wire_and_model_roundtrip() {
    let b = WasmBorder {
        style: WasmBorderStyle::Dashed,
        size: 6,
        space: 2,
        color: "#112233".to_string(),
    };
    let docx = b.to_docx();
    assert_eq!(docx.style, "dashed");
    assert_eq!(docx.size, Some(6));
    assert_eq!(docx.space, Some(2));
    assert_eq!(docx.color.as_deref(), Some("112233"));

    let back = WasmBorder::from_docx(&docx);
    assert_eq!(back.style, WasmBorderStyle::Dashed);
    assert_eq!(back.size, 6);
    assert_eq!(back.space, 2);
    assert_eq!(back.color, "#112233");

    // "auto" color / zero size have no model target.
    let auto = WasmBorder::default().to_docx();
    assert_eq!(auto.style, "none");
    assert!(auto.size.is_none());
    assert!(auto.color.is_none());

    // Unknown model-side styles map to Single (lenient).
    assert_eq!(
        WasmBorderStyle::from_model("wibble"),
        WasmBorderStyle::Single
    );
    assert_eq!(WasmBorderStyle::from_model("dotDash"), WasmBorderStyle::DotDash);
}

// ── set_property / get_property: model-backed kinds ──────────────────

#[test]
fn props_set_get_run_roundtrip() {
    let handle = 5001u32;
    inject(handle, simple_body("hello world"));

    let out = set_property(
        handle,
        "run",
        r##"{"bold": true, "italic": true, "fontSize": 14, "fontName": "Georgia",
           "color": "#ff0000", "underline": "dashDot", "verticalAlignment": "superscript"}"##,
    )
    .expect("set run");

    // Model was patched at the cursor run.
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert!(para.runs[0].bold);
    assert!(para.runs[0].italic);
    assert_eq!(para.runs[0].font_size, Some(28), "14pt == 28 half-points");
    assert_eq!(para.runs[0].font.as_deref(), Some("Georgia"));
    assert_eq!(para.runs[0].color.as_deref(), Some("FF0000"));
    assert_eq!(
        para.runs[0].underline,
        Some(UnderlineType::DashDot)
    );
    assert_eq!(
        para.runs[0].vertical_alignment,
        Some(VerticalAlignment::Superscript)
    );

    // Returned blob and get_property agree (canonical state).
    let got = get_property(handle, "run").expect("get run");
    assert_eq!(json(&got), json(&out));
    let v = json(&got);
    assert_eq!(v["bold"], true);
    assert_eq!(v["fontSize"], 14.0);
    assert_eq!(v["color"], "#FF0000");
    assert_eq!(v["underline"], "dashDot");
    assert_eq!(v["verticalAlignment"], "superscript");
    assert_eq!(v["strikethrough"], false);

    release_document(handle).ok();
}

#[test]
fn props_set_run_clears_raw_rpr() {
    let handle = 5002u32;
    let mut body = DocxBody::default();
    body.blocks.push(DocxBlock::Paragraph(DocxParagraph {
        runs: vec![DocxRun {
            text: "hello".to_string(),
            raw_rpr: Some("<w:rPr><w:b/></w:rPr>".to_string()),
            ..Default::default()
        }],
        ..Default::default()
    }));
    inject(handle, body);

    set_property(handle, "run", r#"{"bold": false}"#).expect("set run");
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert!(para.runs[0].raw_rpr.is_none(), "typed edit must clear raw_rpr");
    assert!(!para.runs[0].bold);

    release_document(handle).ok();
}

#[test]
fn props_set_run_clear_formatting_resets() {
    let handle = 5003u32;
    let mut body = DocxBody::default();
    body.blocks.push(DocxBlock::Paragraph(DocxParagraph {
        runs: vec![DocxRun {
            text: "x".to_string(),
            bold: true,
            font: Some("Arial".to_string()),
            font_size: Some(24),
            color: Some("FF0000".to_string()),
            ..Default::default()
        }],
        ..Default::default()
    }));
    inject(handle, body);

    set_property(handle, "run", r#"{"clearFormatting": true}"#).expect("clear");
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    let r = &para.runs[0];
    assert!(!r.bold);
    assert!(r.font.is_none());
    assert!(r.font_size.is_none());
    assert!(r.color.is_none());
    assert_eq!(r.underline, Some(UnderlineType::None));

    release_document(handle).ok();
}

#[test]
fn props_set_get_paragraph_roundtrip() {
    let handle = 5004u32;
    let mut body = DocxBody::default();
    body.blocks.push(DocxBlock::Paragraph(DocxParagraph {
        raw_ppr: Some("<w:pPr><w:foo/></w:pPr>".to_string()),
        runs: vec![run("para")],
        ..Default::default()
    }));
    inject(handle, body);

    let out = set_property(
        handle,
        "paragraph",
        r##"{"alignment": "center", "indLeft": 720, "spacingBefore": 120,
           "spacingAfter": 60, "keepNext": true, "bidi": false,
           "outlineLevel": 2, "numId": 7, "ilvl": 1,
           "tabs": [{"pos": 1440, "align": "decimal", "leader": "hyphen"}],
           "shd": {"fill": "#DDEEFF"},
           "borders": {"top": {"style": "double", "size": 4, "space": 0, "color": "auto"}}}"##,
    )
    .expect("set paragraph");

    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert!(para.raw_ppr.is_none(), "typed edit must clear raw_ppr");
    assert_eq!(para.properties.alignment, Some(TextAlignment::Center));
    assert_eq!(para.properties.indent_left, Some(720));
    assert_eq!(para.properties.spacing_before, Some(120));
    assert_eq!(para.properties.spacing_after, Some(60));
    assert!(para.properties.keep_next);
    assert_eq!(para.properties.outline_level, Some(2));
    assert_eq!(para.properties.num_id, Some(7));
    assert_eq!(para.properties.ilvl, Some(1));
    assert_eq!(para.properties.tab_stops.len(), 1);
    assert_eq!(para.properties.tab_stops[0].kind, TabStopKind::Decimal);
    assert_eq!(para.properties.shading.as_deref(), Some("#DDEEFF"));
    assert_eq!(
        para.properties.borders.as_ref().and_then(|b| b.top.as_ref()),
        Some(&DocxBorder {
            style: "double".to_string(),
            size: Some(4),
            space: None,
            color: None,
        })
    );

    let got = get_property(handle, "paragraph").expect("get paragraph");
    assert_eq!(json(&got), json(&out));
    let v = json(&got);
    assert_eq!(v["alignment"], "center");
    assert_eq!(v["indLeft"], 720);
    assert_eq!(v["tabs"][0]["align"], "decimal");
    assert_eq!(v["shd"]["fill"], "#DDEEFF");
    assert_eq!(v["borders"]["top"]["style"], "double");

    release_document(handle).ok();
}

#[test]
fn props_paragraph_line_spacing_rule_mapping() {
    let handle = 5005u32;
    inject(handle, simple_body("spaced"));

    set_property(handle, "paragraph", r#"{"spacingLineRule": "onePointFive"}"#)
        .expect("set 1.5x");
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert_eq!(para.properties.spacing_line_rule, Some(LineSpacingRule::AtLeast));
    assert_eq!(para.properties.spacing_line, Some(360), "1.5x implies 360 twips");

    let v = json(&get_property(handle, "paragraph").unwrap());
    assert_eq!(v["spacingLineRule"], "onePointFive");

    // Explicit line wins over the rule-implied one.
    set_property(
        handle,
        "paragraph",
        r#"{"spacingLineRule": "exactly", "spacingLine": 300}"#,
    )
    .expect("set exact");
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert_eq!(para.properties.spacing_line_rule, Some(LineSpacingRule::Exact));
    assert_eq!(para.properties.spacing_line, Some(300));

    release_document(handle).ok();
}

#[test]
fn props_set_get_border_roundtrip() {
    let handle = 5006u32;
    inject(handle, simple_body("bordered"));

    let out = set_property(
        handle,
        "border",
        r##"{"bottom": {"style": "single", "size": 8, "space": 1, "color": "#0000ff"},
           "left": {"style": "thick", "size": 12, "space": 0, "color": "auto"}}"##,
    )
    .expect("set border");

    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    let borders = para.properties.borders.as_ref().expect("borders stored");
    assert_eq!(borders.bottom.as_ref().unwrap().color.as_deref(), Some("0000FF"));
    assert!(borders.left.as_ref().unwrap().color.is_none(), "auto has no target");
    assert!(borders.top.is_none());

    let got = get_property(handle, "border").expect("get border");
    assert_eq!(json(&got), json(&out));
    let v = json(&got);
    assert_eq!(v["bottom"]["style"], "single");
    assert_eq!(v["left"]["color"], "auto");
    // between/bar have no paragraph model target.
    assert!(v.get("between").is_none());

    release_document(handle).ok();
}

#[test]
fn props_set_get_color_roundtrip() {
    let handle = 5007u32;
    inject(handle, simple_body("colored"));

    let out = set_property(handle, "color", r##"{"kind": "srgb", "hex": "#00ff00"}"##)
        .expect("set color");
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert_eq!(para.runs[0].color.as_deref(), Some("00FF00"));

    let v = json(&out);
    assert_eq!(v["kind"], "srgb");
    assert_eq!(v["hex"], "#00FF00");
    assert_eq!(v["rgba"], json("[0, 255, 0, 255]"));

    // "auto" clears the model color.
    let out = set_property(handle, "color", r#"{"kind": "auto"}"#).expect("auto color");
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert!(para.runs[0].color.is_none());
    let v = json(&out);
    assert_eq!(v["kind"], "auto");

    release_document(handle).ok();
}

// ── stored kinds ─────────────────────────────────────────────────────

#[test]
fn props_stored_kind_roundtrip_and_unset_null() {
    let handle = 5008u32;
    inject(handle, simple_body("stored"));

    // Unset stored kind reads back "null".
    assert_eq!(get_property(handle, "paddings").unwrap(), "null");

    let out = set_property(
        handle,
        "paddings",
        r#"{"top": 4.0, "right": 8, "bottom": 4, "left": 8}"#,
    )
    .expect("set paddings");
    assert_eq!(get_property(handle, "paddings").unwrap(), out);
    let v = json(&out);
    assert_eq!(v["top"], 4.0);
    assert_eq!(v["left"], 8.0);

    let shape = set_property(
        handle,
        "shape",
        r##"{"rotation": 90, "flipHorizontal": true,
           "line": {"color": "#000000", "width": 1.5},
           "fill": {"fillType": "solid", "opacity": 0.5},
           "shadow": {"distance": 3, "color": "#333333"},
           "paddings": {"top": 2, "right": 2, "bottom": 2, "left": 2}}"##,
    )
    .expect("set shape");
    let v = json(&shape);
    assert_eq!(v["rotation"], 90.0);
    assert_eq!(v["flipHorizontal"], true);
    assert_eq!(v["line"]["width"], 1.5);
    assert_eq!(v["fill"]["fillType"], "solid");
    assert_eq!(get_property(handle, "shape").unwrap(), shape);

    // pageMargins / bullet / image / rect / stroke / fill / shadow all validate.
    assert!(set_property(handle, "pageMargins", r#"{"left": 1440, "top": 1440}"#).is_ok());
    assert!(set_property(handle, "bullet", r#"{"text": "•", "font": "Symbol"}"#).is_ok());
    assert!(set_property(handle, "image", r#"{"width": 100, "cropLeft": 0.1}"#).is_ok());
    assert!(set_property(handle, "rect", r#"{"x": 1, "width": 10}"#).is_ok());
    assert!(set_property(handle, "stroke", r#"{"color": "auto"}"#).is_ok());
    assert!(set_property(handle, "fill", r#"{"fillType": "none"}"#).is_ok());
    assert!(set_property(handle, "shadow", r#"{"blur": 2}"#).is_ok());

    release_document(handle).ok();
}

#[test]
fn props_stored_kind_dropped_on_release() {
    let handle = 5009u32;
    inject(handle, simple_body("cleanup"));
    set_property(handle, "paddings", r#"{"top": 1}"#).expect("set paddings");
    release_document(handle).expect("release");
    assert_eq!(get_property(handle, "paddings").unwrap(), "null");
}

// ── kind handling and error paths ────────────────────────────────────

#[test]
fn props_kind_case_insensitive_and_aliased() {
    let handle = 5010u32;
    inject(handle, simple_body("kinds"));
    assert!(set_property(handle, "RUN", r#"{"bold": true}"#).is_ok());
    assert!(set_property(handle, "RunFormat", r#"{"italic": true}"#).is_ok());
    assert!(set_property(handle, "ParagraphProperty", r#"{"keepNext": true}"#).is_ok());
    assert!(set_property(handle, "TextBorders", r#"{"top": {"style": "hair", "size": 1, "space": 0, "color": "auto"}}"#).is_ok());
    let v = json(&get_property(handle, "run").unwrap());
    assert_eq!(v["bold"], true);
    assert_eq!(v["italic"], true);
    release_document(handle).ok();
}

#[test]
fn props_unknown_kind_errors() {
    let handle = 5011u32;
    inject(handle, simple_body("errors"));
    let e = set_property(handle, "widget", "{}").unwrap_err();
    assert!(e.contains("Unknown property kind"), "got: {e}");
    let e = get_property(handle, "widget").unwrap_err();
    assert!(e.contains("Unknown property kind"), "got: {e}");
    release_document(handle).ok();
}

#[test]
fn props_invalid_json_errors() {
    let handle = 5012u32;
    inject(handle, simple_body("errors"));
    let e = set_property(handle, "run", "{not json").unwrap_err();
    assert!(e.contains("Invalid run property JSON"), "got: {e}");
    // Valid JSON, wrong shape for the blob.
    let e = set_property(handle, "paddings", r#"{"top": "four"}"#).unwrap_err();
    assert!(e.contains("Invalid paddings property blob"), "got: {e}");
    release_document(handle).ok();
}

#[test]
fn props_empty_body_set_errors_get_empty() {
    let handle = 5013u32;
    inject(handle, DocxBody::default());
    assert!(set_property(handle, "run", r#"{"bold": true}"#).is_err());
    assert!(set_property(handle, "paragraph", r#"{}"#).is_err());
    assert!(set_property(handle, "border", r#"{}"#).is_err());
    assert!(set_property(handle, "color", r#"{}"#).is_err());
    assert_eq!(get_property(handle, "run").unwrap(), "{}");
    assert_eq!(get_property(handle, "paragraph").unwrap(), "{}");
    assert_eq!(get_property(handle, "border").unwrap(), "{}");
    assert_eq!(get_property(handle, "color").unwrap(), "{}");
    release_document(handle).ok();
}

#[test]
fn props_cursor_on_table_block_errors() {
    let handle = 5014u32;
    let mut body = DocxBody::default();
    body.blocks.push(DocxBlock::Table(DocxTable::default()));
    inject(handle, body);
    let e = set_property(handle, "run", r#"{"bold": true}"#).unwrap_err();
    assert!(e.contains("cursor is inside a table"), "got: {e}");
    assert_eq!(get_property(handle, "paragraph").unwrap(), "{}");
    release_document(handle).ok();
}

#[test]
fn props_run_selected_by_cursor_char_index() {
    let handle = 5015u32;
    let mut body = DocxBody::default();
    body.blocks.push(DocxBlock::Paragraph(DocxParagraph {
        runs: vec![run("abc"), run("def")],
        ..Default::default()
    }));
    inject(handle, body);
    // Cursor inside the second run.
    set_cursor(
        handle,
        CursorPos {
            char_idx: 4,
            ..Default::default()
        },
    );
    set_property(handle, "run", r#"{"bold": true}"#).expect("set run");
    let body = extract_body(handle).unwrap();
    let para = match &body.blocks[0] {
        DocxBlock::Paragraph(p) => p,
        _ => panic!("paragraph expected"),
    };
    assert!(!para.runs[0].bold, "first run untouched");
    assert!(para.runs[1].bold, "cursor run bolded");
    release_document(handle).ok();
}
