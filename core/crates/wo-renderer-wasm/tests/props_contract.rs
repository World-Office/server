//! Integration contract tests for the `wo_renderer_wasm::props` module
//! (PORT-PLAN D2 / ORM-03): the camelCase serde wire schema of the
//! `Wasm*` property blobs. Pure serde — no document handles, no global
//! stores — so it can run anywhere the rlib links.

use wo_renderer_wasm::props::{
    WasmBorder, WasmBorderStyle, WasmBullet, WasmColor, WasmColorKind, WasmFill, WasmFillType,
    WasmImageProperty, WasmLineSpacingRule, WasmPageMargins, WasmPaddings, WasmParagraphFrame,
    WasmParagraphProperty, WasmParagraphShd, WasmParagraphSpacing, WasmRect, WasmRunFormat,
    WasmShapeProperty, WasmShadowProperty, WasmStroke, WasmTabStop, WasmTabStopAlign,
    WasmTextAlignment, WasmTextBorders, WasmUnderlineStyle, WasmVerticalAlignment,
};

fn v(s: &str) -> serde_json::Value {
    serde_json::from_str(s).expect("valid JSON in test")
}

#[test]
fn run_format_wire_is_camel_case_points_units() {
    let fmt = WasmRunFormat {
        bold: Some(true),
        font_name: Some("Courier".into()),
        font_size: Some(11.0),
        color: Some("#a1b2c3".into()),
        underline: Some(WasmUnderlineStyle::DashDot),
        vertical_alignment: Some(WasmVerticalAlignment::Subscript),
        ..Default::default()
    };
    let out = serde_json::to_string(&fmt).unwrap();
    let j = v(&out);
    assert_eq!(j["bold"], true);
    assert_eq!(j["fontName"], "Courier");
    assert_eq!(j["fontSize"], 11.0);
    assert_eq!(j["color"], "#a1b2c3");
    assert_eq!(j["underline"], "dashDot");
    assert_eq!(j["verticalAlignment"], "subscript");
    assert!(j.get("font_size").is_none());
    assert!(j.get("vertical_alignment").is_none());
}

#[test]
fn enum_wire_values_match_oo_vocabulary() {
    assert_eq!(serde_json::to_string(&WasmTextAlignment::Justify).unwrap(), "\"justify\"");
    assert_eq!(
        serde_json::to_string(&WasmLineSpacingRule::OnePointFive).unwrap(),
        "\"onePointFive\""
    );
    assert_eq!(
        serde_json::to_string(&WasmLineSpacingRule::AtLeast).unwrap(),
        "\"atLeast\""
    );
    assert_eq!(
        serde_json::to_string(&WasmBorderStyle::DotDotDash).unwrap(),
        "\"dotDotDash\""
    );
    assert_eq!(
        serde_json::to_string(&WasmUnderlineStyle::Thick).unwrap(),
        "\"thick\""
    );
    assert_eq!(
        serde_json::to_string(&WasmFillType::None).unwrap(),
        "\"none\""
    );
    assert_eq!(
        serde_json::to_string(&WasmColorKind::Scheme).unwrap(),
        "\"scheme\""
    );
    // Unknown enum wire values are rejected, not guessed.
    assert!(
        serde_json::from_str::<WasmTextAlignment>("\"flush\"").is_err(),
        "unknown alignment must not deserialize"
    );
}

#[test]
fn stored_blob_wire_is_camel_case() {
    let shape = WasmShapeProperty {
        rotation: Some(180.0),
        flip_vertical: Some(true),
        line: Some(WasmStroke {
            color: Some("#000000".into()),
            width: Some(2.0),
            style: Some("dashDot".into()),
        }),
        fill: Some(WasmFill {
            fill_type: WasmFillType::Solid,
            color: Some(WasmColor {
                kind: WasmColorKind::Srgb,
                hex: Some("#123456".into()),
                ..Default::default()
            }),
            opacity: Some(0.75),
        }),
        shadow: Some(WasmShadowProperty {
            distance: Some(4.0),
            direction: Some(45.0),
            ..Default::default()
        }),
        paddings: Some(WasmPaddings {
            top: 5.0,
            ..Default::default()
        }),
        ..Default::default()
    };
    let j = v(&serde_json::to_string(&shape).unwrap());
    assert_eq!(j["flipVertical"], true);
    assert_eq!(j["line"]["style"], "dashDot");
    assert_eq!(j["fill"]["fillType"], "solid");
    assert_eq!(j["fill"]["color"]["hex"], "#123456");
    assert_eq!(j["shadow"]["direction"], 45.0);
    assert_eq!(j["paddings"]["top"], 5.0);

    let margins = WasmPageMargins {
        left: Some(1440),
        gutter: Some(72),
        footer: Some(720),
        ..Default::default()
    };
    let j = v(&serde_json::to_string(&margins).unwrap());
    assert_eq!(j["left"], 1440);
    assert_eq!(j["gutter"], 72);
    assert_eq!(j["footer"], 720);
    assert!(j.get("gutterWidth").is_none());

    let image = WasmImageProperty {
        crop_top: Some(0.25),
        locked_aspect: Some(true),
        ..Default::default()
    };
    let j = v(&serde_json::to_string(&image).unwrap());
    assert_eq!(j["cropTop"], 0.25);
    assert_eq!(j["lockedAspect"], true);

    let bullet = WasmBullet {
        text: "•".into(),
        font: Some("Symbol".into()),
        ..Default::default()
    };
    let j = v(&serde_json::to_string(&bullet).unwrap());
    assert_eq!(j["text"], "•");
    assert_eq!(j["font"], "Symbol");
}

#[test]
fn paragraph_property_sub_blobs_roundtrip() {
    let p = WasmParagraphProperty {
        spacing_before: Some(100),
        shd: Some(WasmParagraphShd {
            fill: Some("#cccccc".into()),
            ..Default::default()
        }),
        borders: Some(WasmTextBorders {
            between: Some(WasmBorder {
                style: WasmBorderStyle::Hair,
                size: 1,
                space: 0,
                color: "auto".into(),
            }),
            ..Default::default()
        }),
        frame: Some(WasmParagraphFrame {
            w: Some(4000),
            behind_text: Some(true),
            ..Default::default()
        }),
        ..Default::default()
    };
    let j = v(&serde_json::to_string(&p).unwrap());
    assert_eq!(j["shd"]["fill"], "#cccccc");
    assert_eq!(j["borders"]["between"]["style"], "hair");
    assert_eq!(j["frame"]["w"], 4000);
    assert_eq!(j["frame"]["behindText"], true);
    let back: WasmParagraphProperty =
        serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
    assert_eq!(back, p);

    // WasmParagraphSpacing / WasmTabStop / WasmRect standalone blobs.
    let spacing = WasmParagraphSpacing {
        before_lines: Some(2),
        line: Some(240),
        line_rule: Some(WasmLineSpacingRule::Double),
        ..Default::default()
    };
    let j = v(&serde_json::to_string(&spacing).unwrap());
    assert_eq!(j["beforeLines"], 2);
    assert_eq!(j["lineRule"], "double");

    let tab = WasmTabStop {
        pos: 2880,
        align: WasmTabStopAlign::Decimal,
        leader: Some("underscore".into()),
    };
    let j = v(&serde_json::to_string(&tab).unwrap());
    assert_eq!(j["align"], "decimal");
    assert_eq!(j["leader"], "underscore");

    let rect = WasmRect {
        x: 1.5,
        width: 10.0,
        ..Default::default()
    };
    let j = v(&serde_json::to_string(&rect).unwrap());
    assert_eq!(j["x"], 1.5);
    assert_eq!(j["y"], 0.0);
}

#[test]
fn set_get_property_exports_are_callable() {
    // No document exists at handle 999_999: model-backed kinds must fail
    // with a handle error (not panic), proving the exports link natively.
    let err = wo_renderer_wasm::get_property(999_999, "run").unwrap_err();
    assert!(err.contains("not found"), "got: {err}");
    let err = wo_renderer_wasm::set_property(999_999, "run", "{}").unwrap_err();
    assert!(err.contains("not found"), "got: {err}");
}
