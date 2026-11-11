//! P2-04 — DOCX style-chain resolution tests.
//!
//! Covers the `docDefaults → w:basedOn chain → style → direct formatting`
//! precedence ([`crate::model::DocxStyleChain`]) plus the new
//! `w:docDefaults` / `w:latentStyles` / style-metadata parsing and the
//! `OoxmlSerializer::build_styles_xml_from` emission that round-trips it.

use crate::model::*;
use crate::parser::OoxmlParser;
use crate::serializer::OoxmlSerializer;
use std::io::{Read, Write};

// --- fixtures ---------------------------------------------------------------

const W_NS: &str = r#"xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main""#;

/// A styles.xml exercising every layer: docDefaults, latentStyles, a
/// default-flagged Normal, a two-level basedOn chain, a basedOn cycle,
/// character styles and a table style.
const RICH_STYLES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles XMLNS>
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
        <w:color w:val="333333"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="200" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:latentStyles w:defLockedState="0" w:defSemiHidden="1" w:defUnhideWhenUsed="0" w:defUiPriority="99">
    <w:lsdException w:name="Balloon Text" w:semiHidden="0" w:uiPriority="39"/>
    <w:lsdException w:name="header" w:locked="1"/>
  </w:latentStyles>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="160"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Georgia"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="Heading1Char"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="480" w:after="0"/><w:keepNext/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Heading1"/>
    <w:rPr><w:i/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CycleA">
    <w:name w:val="Cycle A"/>
    <w:basedOn w:val="CycleB"/>
    <w:rPr><w:i/><w:color w:val="AA0000"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CycleB">
    <w:name w:val="Cycle B"/>
    <w:basedOn w:val="CycleA"/>
    <w:rPr><w:b/></w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Heading1Char">
    <w:name w:val="Heading 1 Char"/>
    <w:uiPriority w:val="9"/>
    <w:semiHidden/>
    <w:locked/>
    <w:unhideWhenUsed/>
    <w:rPr><w:i/></w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Emphasis">
    <w:name w:val="Emphasis"/>
    <w:rPr><w:i/><w:color w:val="101010"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:default="1" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:basedOn w:val="TableNormal"/>
  </w:style>
</w:styles>"#;

/// Wrap a styles.xml fragment into a minimal DOCX zip and parse it.
fn parse_styles_xml(styles_xml: &str) -> DocxStyles {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        zip.start_file("word/styles.xml", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(styles_xml.as_bytes()).unwrap();
        zip.finish().unwrap();
    }
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&buf[..])).unwrap();
    OoxmlParser::new()
        .parse_styles(&mut archive)
        .unwrap()
        .expect("word/styles.xml present")
}

fn rich_styles() -> DocxStyles {
    parse_styles_xml(&RICH_STYLES_XML.replace("XMLNS", W_NS))
}

fn read_zip_entry(bytes: &[u8], name: &str) -> String {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    let mut entry = archive.by_name(name).unwrap();
    let mut out = String::new();
    entry.read_to_string(&mut out).unwrap();
    out
}

// --- docDefaults ------------------------------------------------------------

#[test]
fn doc_defaults_parsed_from_styles_xml() {
    let styles = rich_styles();
    // rPrDefault: font, color and size flow out of w:rPrDefault/w:rPr.
    assert_eq!(
        styles.defaults.run_properties.font.as_deref(),
        Some("Times New Roman")
    );
    assert_eq!(styles.defaults.run_properties.font_size, Some(24));
    assert_eq!(
        styles.defaults.run_properties.color.as_deref(),
        Some("333333")
    );
    // pPrDefault: w:spacing after/line/lineRule.
    assert_eq!(
        styles.defaults.paragraph_properties.spacing_after,
        Some(200)
    );
    assert_eq!(styles.defaults.paragraph_properties.spacing_line, Some(276));
    assert_eq!(
        styles.defaults.paragraph_properties.spacing_line_rule,
        Some(LineSpacingRule::Auto)
    );
    // No docDefaults at all → empty defaults, still parseable.
    let bare = parse_styles_xml(&format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {W_NS}></w:styles>"#
    ));
    assert_eq!(bare.defaults, DocxDocDefaults::default());
}

// --- basedOn chain resolution -----------------------------------------------

#[test]
fn based_on_chain_resolves_through_ancestors() {
    let styles = rich_styles();
    let chain = styles.resolve_paragraph_chain(Some("Heading1"), None);
    // Ancestry is root-first, the style itself last.
    assert_eq!(
        chain.ancestry,
        vec!["Normal".to_string(), "Heading1".to_string()]
    );
    assert!(!chain.missing && !chain.cycle);
    // Heading1's own layer: bold + sz 36.
    assert_eq!(chain.run_properties.bold, Some(true));
    assert_eq!(chain.run_properties.font_size, Some(36));
    // Inherited from Normal: Georgia beats docDefaults' Times New Roman.
    assert_eq!(chain.run_properties.font.as_deref(), Some("Georgia"));
    // Inherited paragraph spacing: before from Heading1; Heading1's own
    // explicit w:after="0" overrides Normal's 160 (explicit values win —
    // even zero); line comes from docDefaults only.
    assert_eq!(chain.paragraph_properties.spacing_before, Some(480));
    assert_eq!(chain.paragraph_properties.spacing_after, Some(0));
    assert_eq!(chain.paragraph_properties.spacing_line, Some(276));
    assert!(chain.paragraph_properties.keep_next);
}

#[test]
fn nearest_layer_wins_over_distant_layers() {
    let styles = rich_styles();
    // Heading2 sets only italic; size and bold come from Heading1, font from
    // Normal — every nearer layer beats a farther one.
    let chain = styles.resolve_paragraph_chain(Some("Heading2"), None);
    assert_eq!(
        chain.ancestry,
        vec![
            "Normal".to_string(),
            "Heading1".to_string(),
            "Heading2".to_string()
        ]
    );
    assert_eq!(chain.run_properties.italic, Some(true));
    assert_eq!(chain.run_properties.bold, Some(true));
    assert_eq!(chain.run_properties.font_size, Some(36));
    assert_eq!(chain.run_properties.font.as_deref(), Some("Georgia"));
}

#[test]
fn direct_formatting_wins_over_style_chain() {
    let styles = rich_styles();
    let direct = DocxParagraphProperties {
        spacing_after: Some(0),
        alignment: Some(TextAlignment::Center),
        ..DocxParagraphProperties::default()
    };
    let chain = styles.resolve_paragraph_chain(Some("Heading1"), Some(&direct));
    // Direct layer overrides the chain…
    assert_eq!(chain.paragraph_properties.spacing_after, Some(0));
    assert_eq!(
        chain.paragraph_properties.alignment,
        Some(TextAlignment::Center)
    );
    // …but only where it is set: everything else still inherits.
    assert_eq!(chain.paragraph_properties.spacing_before, Some(480));
    assert!(chain.paragraph_properties.keep_next);

    let run_direct = DocxRunProperties {
        font_size: Some(40),
        ..DocxRunProperties::default()
    };
    let run = styles.resolve_run_chain(Some("Heading1"), None, Some(&run_direct));
    assert_eq!(run.run_properties.font_size, Some(40));
    assert_eq!(run.run_properties.bold, Some(true));
}

// --- character styles -------------------------------------------------------

#[test]
fn character_style_overlays_paragraph_run_props() {
    let styles = rich_styles();
    // Emphasis (italic + color) overlays the Heading1 chain (bold, sz 36,
    // Georgia): italic joins, nothing from the paragraph layer is lost.
    let run = styles.resolve_run_chain(Some("Heading1"), Some("Emphasis"), None);
    assert_eq!(run.run_properties.italic, Some(true));
    assert_eq!(run.run_properties.bold, Some(true));
    assert_eq!(run.run_properties.font_size, Some(36));
    assert_eq!(run.run_properties.color.as_deref(), Some("101010"));
    // The character style has its own basedOn chain available too.
    let char_chain = styles.resolve_run_chain(None, Some("Emphasis"), None);
    assert_eq!(char_chain.run_properties.italic, Some(true));
    // docDefaults still apply when no style is named at all.
    let bare = styles.resolve_run_chain(None, None, None);
    assert_eq!(bare.run_properties.font_size, Some(24));
    assert_eq!(bare.run_properties.font.as_deref(), Some("Times New Roman"));
}

#[test]
fn character_style_metadata_parsed() {
    let styles = rich_styles();
    let link = styles
        .character_styles
        .iter()
        .find(|s| s.style_id == "Heading1Char")
        .unwrap();
    assert!(link.semi_hidden && link.locked && link.unhide_when_used);
    assert_eq!(link.ui_priority, Some(9));
    // Paragraph side of the link pair.
    let h1 = styles.paragraph_style("Heading1").unwrap();
    assert_eq!(h1.link.as_deref(), Some("Heading1Char"));
    assert_eq!(h1.next.as_deref(), Some("Normal"));
    assert_eq!(h1.ui_priority, Some(9));
    assert!(h1.q_format);
    assert!(!h1.default_style, "Heading1 is not flagged w:default");
    assert!(
        styles.paragraph_style("Normal").unwrap().default_style,
        "Normal carries w:default=1"
    );
    assert!(!link.default_style);
}

// --- cycles and missing styles ---------------------------------------------

#[test]
fn based_on_cycle_is_cut_not_looped() {
    let styles = rich_styles();
    let chain = styles.resolve_paragraph_chain(Some("CycleA"), None);
    assert!(chain.cycle, "CycleA ↔ CycleB must be flagged as a cycle");
    // The chain still resolves: both members applied once, the named style
    // (CycleA) last so its own props win.
    assert_eq!(chain.run_properties.italic, Some(true));
    assert_eq!(chain.run_properties.bold, Some(true));
    assert_eq!(chain.run_properties.color.as_deref(), Some("AA0000"));
}

#[test]
fn missing_style_falls_back_to_doc_defaults() {
    let styles = rich_styles();
    let chain = styles.resolve_paragraph_chain(Some("NoSuchStyle"), None);
    assert!(chain.missing);
    assert!(chain.ancestry.is_empty());
    assert!(!chain.cycle);
    // No style layer applies: only docDefaults.
    assert_eq!(chain.run_properties, styles.defaults.run_properties);
    assert_eq!(
        chain.paragraph_properties,
        styles.defaults.paragraph_properties
    );
    // …and convenience wrappers agree.
    let direct = DocxParagraphProperties::default();
    assert_eq!(
        styles.get_paragraph_props("NoSuchStyle", &direct),
        styles.defaults.paragraph_properties
    );
    let run_direct = DocxRunProperties::default();
    assert_eq!(
        styles.get_run_props("NoSuchStyle", None, &run_direct),
        styles.defaults.run_properties
    );
    // A dangling basedOn parent is handled the same way (no panic, no layer).
    let dangling = parse_styles_xml(&format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {W_NS}>
  <w:style w:type="paragraph" w:styleId="Orphan">
    <w:name w:val="Orphan"/>
    <w:basedOn w:val="Ghost"/>
    <w:rPr><w:b/></w:rPr>
  </w:style>
</w:styles>"#
    ));
    let chain = dangling.resolve_paragraph_chain(Some("Orphan"), None);
    assert!(!chain.missing);
    assert_eq!(chain.ancestry, vec!["Orphan".to_string()]);
    assert_eq!(chain.run_properties.bold, Some(true));
}

// --- latent styles ----------------------------------------------------------

#[test]
fn latent_styles_parsed_and_matched() {
    let styles = rich_styles();
    assert!(styles.latent_styles.def_semi_hidden);
    assert!(!styles.latent_styles.def_locked);
    assert!(!styles.latent_styles.def_unhide_when_used);
    assert_eq!(styles.latent_styles.def_ui_priority, Some(99));
    assert_eq!(styles.latent_styles.exceptions.len(), 2);

    let balloon = styles.latent_exception("Balloon Text").unwrap();
    assert!(
        !balloon.semi_hidden,
        "explicit lsdException overrides the default"
    );
    assert_eq!(balloon.ui_priority, Some(39));
    assert!(styles.latent_exception("header").unwrap().locked);
    assert!(styles.latent_exception("Not Declared").is_none());

    // A style id that exists only as a latent declaration resolves to
    // defaults and records the latent exception.
    let chain = styles.resolve_paragraph_chain(Some("Balloon Text"), None);
    assert!(chain.missing);
    assert!(chain.latent.is_some());
    assert_eq!(chain.run_properties, styles.defaults.run_properties);
    // Defined styles can match a latent entry through their w:name too.
    let renamed = parse_styles_xml(&format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {W_NS}>
  <w:latentStyles><w:lsdException w:name="Balloon Text" w:locked="1"/></w:latentStyles>
  <w:style w:type="paragraph" w:styleId="BalloonText">
    <w:name w:val="Balloon Text"/>
    <w:rPr><w:i/></w:rPr>
  </w:style>
</w:styles>"#
    ));
    let chain = renamed.resolve_paragraph_chain(Some("BalloonText"), None);
    assert!(!chain.missing);
    assert_eq!(chain.latent.as_ref().unwrap().name, "Balloon Text");
    assert!(chain.latent.as_ref().unwrap().locked);
    assert_eq!(chain.run_properties.italic, Some(true));
}

// --- convenience wrappers and merge semantics -------------------------------

#[test]
fn get_paragraph_props_and_get_run_props() {
    let styles = rich_styles();
    let direct_p = DocxParagraphProperties::default();
    let p = styles.get_paragraph_props("Heading1", &direct_p);
    assert_eq!(p.spacing_before, Some(480));
    // Heading1's explicit w:after="0" beats Normal's 160.
    assert_eq!(p.spacing_after, Some(0));
    assert!(p.keep_next);

    let direct_r = DocxRunProperties::default();
    let r = styles.get_run_props("Heading1", Some("Emphasis"), &direct_r);
    assert_eq!(r.bold, Some(true));
    assert_eq!(r.italic, Some(true));
    assert_eq!(r.font_size, Some(36));
}

#[test]
fn overlay_merge_semantics() {
    let base = DocxParagraphProperties {
        spacing_after: Some(200),
        keep_next: true,
        tab_stops: vec![TabStop {
            kind: TabStopKind::Left,
            pos: 720,
            leader: None,
        }],
        ..DocxParagraphProperties::default()
    };
    let over = DocxParagraphProperties {
        alignment: Some(TextAlignment::Right),
        keep_lines: true,
        ..DocxParagraphProperties::default()
    };
    let merged = base.overlay(&over);
    // Set in over → wins; unset in over → inherits; toggles merge as "either".
    assert_eq!(merged.alignment, Some(TextAlignment::Right));
    assert_eq!(merged.spacing_after, Some(200));
    assert!(merged.keep_next && merged.keep_lines);
    assert_eq!(merged.tab_stops.len(), 1);
    // Over's tab stops replace the set when present.
    let over_tabs = DocxParagraphProperties {
        tab_stops: vec![TabStop {
            kind: TabStopKind::Right,
            pos: 1440,
            leader: None,
        }],
        ..DocxParagraphProperties::default()
    };
    assert_eq!(base.overlay(&over_tabs).tab_stops.len(), 1);
    assert_eq!(base.overlay(&over_tabs).tab_stops[0].pos, 1440);

    let rbase = DocxRunProperties {
        bold: Some(false),
        font_size: Some(24),
        ..DocxRunProperties::default()
    };
    let rover = DocxRunProperties {
        bold: Some(true),
        ..DocxRunProperties::default()
    };
    let merged = rbase.overlay(&rover);
    assert_eq!(merged.bold, Some(true));
    assert_eq!(merged.font_size, Some(24));
}

#[test]
fn empty_styles_document_resolves_defaults_only() {
    let styles = DocxStyles::default();
    let chain = styles.resolve_paragraph_chain(Some("Anything"), None);
    assert!(chain.missing);
    assert_eq!(chain.run_properties, DocxRunProperties::default());
    // No panic without defaults, styles or latent styles.
    let _ = styles.resolve_run_chain(Some("A"), Some("B"), None);
}

#[test]
fn table_style_based_on_recorded() {
    let styles = rich_styles();
    let table = styles
        .table_styles
        .iter()
        .find(|s| s.style_id == "TableGrid")
        .unwrap();
    assert!(table.default_style);
    assert_eq!(table.based_on.as_deref(), Some("TableNormal"));
}

// --- serializer round trip --------------------------------------------------

#[test]
fn serializer_round_trips_style_chain() {
    let styles = rich_styles();
    let xml = OoxmlSerializer::new().build_styles_xml_from(&styles);
    assert!(xml.contains("<w:docDefaults>"));
    assert!(xml.contains("<w:latentStyles"));
    assert!(xml.contains(r#"<w:lsdException w:name="Balloon Text""#));

    let reparsed = parse_styles_xml(&xml);
    // Defaults survive byte-for-byte at the typed level.
    assert_eq!(reparsed.defaults, styles.defaults);
    // Latent styles survive.
    assert!(reparsed.latent_styles.def_semi_hidden);
    assert_eq!(
        reparsed
            .latent_exception("Balloon Text")
            .unwrap()
            .ui_priority,
        Some(39)
    );
    // Style metadata survives.
    let h1 = reparsed.paragraph_style("Heading1").unwrap();
    assert_eq!(h1.based_on.as_deref(), Some("Normal"));
    assert!(h1.q_format);
    let normal_def = reparsed.paragraph_style("Normal").unwrap();
    assert!(normal_def.default_style);
    assert!(!h1.default_style);
    // …and the resolved chain is identical after the round trip.
    for style_id in ["Normal", "Heading1", "Heading2", "CycleA"] {
        assert_eq!(
            reparsed.resolve_paragraph_chain(Some(style_id), None),
            styles.resolve_paragraph_chain(Some(style_id), None),
            "chain for {style_id} must survive parse → serialize → parse"
        );
    }
}

#[test]
fn serializer_builtin_styles_xml_resolves() {
    // The fixed template serialize() emits must itself resolve: its
    // docDefaults + Normal + Heading1 chain is exactly the layout foreign
    // documents rely on.
    let doc = OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties::default(),
        docx_body: Some(DocxBody::default()),
        relationships: Vec::new(),
        xlsx_workbook: None,
    };
    let bytes = OoxmlSerializer::new().serialize(&doc).unwrap();
    let styles_xml = read_zip_entry(&bytes, "word/styles.xml");
    let styles = parse_styles_xml(&styles_xml);

    assert_eq!(styles.defaults.run_properties.font_size, Some(24));
    assert_eq!(
        styles.defaults.paragraph_properties.spacing_after,
        Some(200)
    );

    let chain = styles.resolve_paragraph_chain(Some("Heading1"), None);
    assert_eq!(chain.run_properties.bold, Some(true));
    assert_eq!(chain.run_properties.font_size, Some(36));
    assert_eq!(
        chain.run_properties.font.as_deref(),
        Some("Times New Roman")
    );
    assert_eq!(chain.paragraph_properties.spacing_before, Some(480));
    // ListNumber → ListParagraph → Normal: two basedOn hops.
    let list = styles.resolve_paragraph_chain(Some("ListNumber"), None);
    assert_eq!(
        list.ancestry,
        vec![
            "Normal".to_string(),
            "ListParagraph".to_string(),
            "ListNumber".to_string()
        ]
    );
    assert_eq!(list.run_properties.font_size, Some(24));
    // The default-flagged Normal is discoverable for body content that
    // names no style at all.
    let normal = styles
        .paragraph_styles
        .iter()
        .find(|s| s.default_style)
        .unwrap();
    assert_eq!(normal.style_id, "Normal");
}
