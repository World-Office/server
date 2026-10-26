//! BUG9-CONVERTER-CONTRACT: editor payload fragments as Rust-side contract
//! tests. Each fixture mirrors the REAL saved-HTML dialect emitted by
//! apps/web/apps/documenteditor-wysiwyg/editor.js (`flatHtml`), parsed and
//! re-serialized through wo-html. The contract: every semantic the editor
//! emits must survive conversion through a defined channel — or its drop
//! must be documented here with the surviving fallback channel.

use wo_html::{HtmlParser, HtmlSerializer};

// CONTRACT-ATTRS-BEGIN — keep in sync with DOC_SEMANTIC_DATA_ATTRS in
// apps/web/apps/documenteditor-wysiwyg/editor.js (cross-checked by
// roundtrip.test.mjs).
pub const DOC_SEMANTIC_DATA_ATTRS: &[&str] = &[
    // -> `dir` attribute carries bidi state (editor emits dir alongside)
    "data-textdir",
    // -> img alt marker `__wo-<kind>__<json>` (hydrateVectorObjects restores)
    "data-kind",
    // -> img alt marker JSON payload
    "data-spec",
    // -> Comment.author
    "data-author",
    // -> Comment.replies
    "data-replies",
    // -> Comment.resolved
    "data-resolved",
    // -> Comment.id
    "data-id",
    // -> Comment.comment
    "data-comment",
    // -> documented drop: text survives; no InlineElement channel today
    "data-cc",
    // -> documented drop: bookmark name; text survives
    "data-name",
    // -> documented drop on nav; Image.title is the surviving title channel
    "data-title",
];
// CONTRACT-ATTRS-END

fn wrap(body: &str) -> String {
    format!("<html><head></head><body>{body}</body></html>")
}

fn roundtrip(body: &str) -> String {
    let doc = HtmlParser::new()
        .parse(wrap(body).as_bytes())
        .expect("fixture must parse");
    HtmlSerializer::new().serialize(&doc)
}

fn roundtrip_doc(body: &str) -> wo_html::HtmlDocument {
    HtmlParser::new()
        .parse(wrap(body).as_bytes())
        .expect("fixture must parse")
}

// ---------------------------------------------------------------------------
// Channel demos, one per semantic carrier. The table test below maps every
// DOC_SEMANTIC_DATA_ATTRS entry to one of these.
// ---------------------------------------------------------------------------

/// data-textdir channel: block bidi state rides the standard `dir` attribute
/// (parser F-041: dir attr wins over style.direction; serializer emits dir).
fn assert_dir_channel() {
    let out = roundtrip(r#"<p dir="rtl">سلام</p>"#);
    assert!(out.contains(r#"<p dir="rtl">"#), "dir attr lost: {out}");
    assert!(out.contains("سلام"), "text lost: {out}");
    // style-only variant normalizes to the dir attribute.
    let out = roundtrip(r#"<p style="direction: rtl">x</p>"#);
    assert!(
        out.contains(r#"dir="rtl""#),
        "style.direction not promoted: {out}"
    );
}

/// data-kind / data-spec channel: the img alt marker
/// `__wo-<kind>__<json>` is the designed conversion carrier (editor's
/// hydrateVectorObjects restores data-kind/data-spec from alt on reload);
/// the raw attrs themselves are dropped by wo-html's Image model.
fn assert_alt_marker_channel() {
    let spec = r#"{"type":"bar","series":[1,2]}"#;
    let spec_esc = spec.replace('"', "&quot;");
    let input = format!(
        r#"<p><img src="data:image/png;base64,AAAA" alt="__wo-chart__{spec_esc}" data-kind="chart" data-spec="{spec_esc}" title="Chart" width="420"/></p>"#
    );
    let out1 = roundtrip(&input);
    assert!(out1.contains("__wo-chart__"), "alt marker lost: {out1}");
    assert!(
        out1.contains("data:image/png;base64,AAAA"),
        "src lost: {out1}"
    );
    assert!(out1.contains("width=\"420\""), "width lost: {out1}");
    assert!(
        !out1.contains("data-kind"),
        "data-kind unexpectedly kept: {out1}"
    );
    // Stable across a second hop: parse(serialize(parse)) yields same alt.
    let doc2 = HtmlParser::new().parse(out1.as_bytes()).expect("reparse");
    let out2 = HtmlSerializer::new().serialize(&doc2);
    assert_eq!(out1, out2, "alt marker channel not round-trip stable");
    // Equation variant.
    let out = roundtrip(
        r#"<p><img src="data:image/png;base64,BBBB" alt="__wo-equation__{&quot;latex&quot;:&quot;E=mc^2&quot;}" data-kind="equation" data-spec="{&quot;latex&quot;:&quot;E=mc^2&quot;}"/></p>"#,
    );
    assert!(
        out.contains("__wo-equation__"),
        "equation marker lost: {out}"
    );
    assert!(out.contains("E=mc^2"), "equation spec JSON lost: {out}");
}

/// data-author / data-replies / data-resolved / data-id / data-comment
/// channel: the Comment inline model (parser F-102).
fn assert_comment_channel() {
    let input = r#"<p><span class="comment" data-id="c1" data-author="Alice" data-comment="Fix this" data-resolved="1" data-replies="[{&quot;author&quot;:&quot;Bob&quot;,&quot;text&quot;:&quot;done&quot;}]">body text</span></p>"#;
    let out = roundtrip(input);
    assert!(out.contains(r#"data-author="Alice""#), "author lost: {out}");
    assert!(
        out.contains(r#"data-comment="Fix this""#),
        "comment body lost: {out}"
    );
    assert!(out.contains(r#"data-id="c1""#), "comment id lost: {out}");
    assert!(out.contains(r#"data-resolved="1""#), "resolved lost: {out}");
    assert!(
        out.contains("&quot;author&quot;:&quot;Bob&quot;"),
        "replies JSON lost: {out}"
    );
    assert!(out.contains("body text"), "commented text lost: {out}");
    // Semantic check via model: replies parsed into CommentReply fields.
    let doc = roundtrip_doc(input);
    let body = doc.body.elements.first().cloned().expect("p block");
    let wo_html::model::BlockElement::Paragraph { content, .. } = body else {
        panic!("expected Paragraph, got {body:?}");
    };
    let wo_html::model::InlineElement::Comment {
        author,
        comment,
        id,
        resolved,
        replies,
        ..
    } = &content[0]
    else {
        panic!("expected Comment inline, got {:?}", content[0]);
    };
    assert_eq!(author, "Alice");
    assert_eq!(comment, "Fix this");
    assert_eq!(id.as_deref(), Some("c1"));
    assert!(*resolved);
    assert_eq!(replies.len(), 1);
    assert_eq!(replies[0].author, "Bob");
    assert_eq!(replies[0].text, "done");
    // Unresolved comment without replies: no resolved/replies in output.
    let out = roundtrip(
        r#"<p><span class="comment" data-id="c2" data-author="A" data-comment="c">t</span></p>"#,
    );
    assert!(!out.contains("data-resolved"), "resolved leaked: {out}");
    assert!(!out.contains("data-replies"), "replies leaked: {out}");
}

/// data-cc channel (documented drop): content-control span has no wo-html
/// inline channel, so the attr drops — but the control's text content must
/// survive. Lifting data-cc into the model is blocked out-of-scope: wo-x2t
/// matches InlineElement exhaustively (FB2 converter, no wildcard arm), so
/// adding a variant breaks that crate.
fn assert_content_control_text_channel() {
    let out = roundtrip(
        r#"<p><span class="content-control" data-cc="date" title="Date">2026-10-26</span></p>"#,
    );
    assert!(out.contains("2026-10-26"), "control text lost: {out}");
    assert!(!out.contains("data-cc"), "data-cc unexpectedly kept: {out}");
}

/// data-name channel (documented drop): bookmark name has no channel; the
/// bookmarked text survives as plain content.
fn assert_bookmark_text_channel() {
    let out = roundtrip(r#"<p><span class="bookmark" data-name="sec-1">Anchor</span></p>"#);
    assert!(out.contains("Anchor"), "bookmark text lost: {out}");
    assert!(
        !out.contains("data-name"),
        "data-name unexpectedly kept: {out}"
    );
}

/// data-title channel on nav (documented drop): the toc caption attr drops;
/// heading/list content carries the visible title. Image.title is the
/// surviving title channel for imgs (asserted in the alt-marker channel).
fn assert_nav_title_drop() {
    let out = roundtrip(
        r#"<nav class="toc" data-kind="toc" data-title="Table of Contents"><p>Intro</p></nav>"#,
    );
    assert!(
        !out.contains("data-title"),
        "nav data-title unexpectedly kept: {out}"
    );
    assert!(out.contains("Intro"), "nav content lost: {out}");
}

// ---------------------------------------------------------------------------
// Container fixtures
// ---------------------------------------------------------------------------

/// TOC nav: editor emits `<nav class="toc">`; wo-html must merge the user
/// class with the tag so the toc dialect survives as Div{class:"nav toc"}.
#[test]
fn toc_nav_class_merges() {
    let doc = roundtrip_doc(
        r#"<nav class="toc" data-kind="toc"><h2>Contents</h2><ol><li>Intro</li></ol></nav>"#,
    );
    let wo_html::model::BlockElement::Div {
        class, elements, ..
    } = &doc.body.elements[0]
    else {
        panic!("expected Div, got {:?}", doc.body.elements[0]);
    };
    assert_eq!(class.as_deref(), Some("nav toc"), "user class not merged");
    assert!(elements.len() >= 2, "nav children lost");
    let out = roundtrip(
        r#"<nav class="toc" data-kind="toc"><h2>Contents</h2><ol><li>Intro</li></ol></nav>"#,
    );
    assert!(
        out.contains(r#"<div class="nav toc">"#),
        "merged class not serialized: {out}"
    );
    assert!(out.contains("Intro"), "toc entries lost: {out}");
    // Figures list dialect.
    let out = roundtrip(r#"<nav class="toc" data-kind="figures"><p>Fig 1</p></nav>"#);
    assert!(
        out.contains(r#"<div class="nav toc">"#),
        "figures nav class lost: {out}"
    );
    assert!(out.contains("Fig 1"), "figures content lost: {out}");
    // Bare nav keeps plain tag class (existing behavior).
    let doc = roundtrip_doc("<nav><p>x</p></nav>");
    let wo_html::model::BlockElement::Div { class, .. } = &doc.body.elements[0] else {
        panic!("expected Div");
    };
    assert_eq!(class.as_deref(), Some("nav"));
}

/// Header/footer furniture: wo-x2t `furniture_spans` matches
/// `class == "header"` / `class == "footer"` by EXACT equality on
/// Div{class}, so the parser must keep `class = tag` (user class dropped)
/// for these two tags — never merge.
#[test]
fn header_footer_furniture_contract() {
    let doc = roundtrip_doc(
        r#"<header class="page-header"><p>H</p></header><p>B</p><footer class="page-footer"><p>F</p></footer>"#,
    );
    let blocks = &doc.body.elements;
    let wo_html::model::BlockElement::Div {
        class, elements, ..
    } = &blocks[0]
    else {
        panic!("expected Div, got {:?}", blocks[0]);
    };
    assert_eq!(
        class.as_deref(),
        Some("header"),
        "header class must stay exact"
    );
    assert!(!elements.is_empty(), "header children lost");
    let wo_html::model::BlockElement::Div { class, .. } = &blocks[blocks.len() - 1] else {
        panic!("expected Div, got {:?}", blocks[blocks.len() - 1]);
    };
    assert_eq!(
        class.as_deref(),
        Some("footer"),
        "footer class must stay exact"
    );
    let out = roundtrip(
        r#"<header class="page-header"><p>H</p></header><p>B</p><footer class="page-footer"><p>F</p></footer>"#,
    );
    assert!(
        out.contains(r#"<div class="header">"#),
        "header furniture lost: {out}"
    );
    assert!(
        out.contains(r#"<div class="footer">"#),
        "footer furniture lost: {out}"
    );
    assert!(out.contains("B"), "body content lost: {out}");
}

// ---------------------------------------------------------------------------
// Inline dialect fixtures
// ---------------------------------------------------------------------------

/// Drop cap: class drops (no channel), but the cap letter and the rest of
/// the paragraph must merge into surviving text.
#[test]
fn dropcap_text_survives() {
    let out = roundtrip(r#"<p><span class="dropcap in-margin">W</span>ord</p>"#);
    assert!(out.contains("W"), "drop cap letter lost: {out}");
    assert!(out.contains("ord"), "paragraph text lost: {out}");
    assert!(
        !out.contains("dropcap"),
        "dropcap class unexpectedly kept: {out}"
    );
}

/// Misspell-stripped text: after the editor strips .wo-misspelled markers,
/// the payload is plain text and must round-trip verbatim.
#[test]
fn misspell_stripped_text_verbatim() {
    let out = roundtrip("<p>correct text only</p>");
    assert!(
        out.contains("<p>correct text only</p>"),
        "plain text mutated: {out}"
    );
}

// ---------------------------------------------------------------------------
// Contract table: every DOC_SEMANTIC_DATA_ATTRS entry must map to a channel.
// Adding an attr to the list without wiring a channel here fails the build.
// ---------------------------------------------------------------------------

#[test]
fn doc_semantic_attrs_have_channels() {
    for attr in DOC_SEMANTIC_DATA_ATTRS {
        match *attr {
            "data-textdir" => assert_dir_channel(),
            "data-kind" | "data-spec" => assert_alt_marker_channel(),
            "data-author" | "data-replies" | "data-resolved" | "data-id" | "data-comment" => {
                assert_comment_channel()
            }
            "data-cc" => assert_content_control_text_channel(),
            "data-name" => assert_bookmark_text_channel(),
            "data-title" => assert_nav_title_drop(),
            other => panic!("DOC_SEMANTIC_DATA_ATTRS entry {other:?} has no contract channel"),
        }
    }
}
