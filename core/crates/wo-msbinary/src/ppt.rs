//! Minimal PowerPoint 97-2003 (.ppt) slide-text reader.
//!
//! PowerPoint stores the document inside an OLE stream named
//! `PowerPoint Document`. The stream is a tree of records:
//!
//! ```text
//! record = u8(recVer:4, recInstance:4) u8(recInstance2) u16(recType)
//!          u32(recLen) data ;
//! container := records with recVer == 0xF (children follow)
//! ```
//!
//! Slide text lives as `TextHeaderAtom` (0x0F9F) followed by a
//! `TextCharsAtom` (0x0FA0, UTF-16LE) or `TextBytesAtom` (0x0FA8, 8-bit).
//! A slide is produced for each **slide container** (SlideContainer 0x0FF8
//! or MainMasterContainer 0x0FEE) that owns real, non-placeholder text:
//! the first paragraph is the title, the rest the body. Master/layout
//! containers whose text is all placeholder boilerplate ("Click to edit ...",
//! lone "*") are filtered out.
//!
//! Scope note (F-305): read-only, text-only. Positioning, images, charts,
//! animations and notes are intentionally out of scope (fidelity L4).

/// One slide's worth of text, in stream order.
#[derive(Debug, Clone, PartialEq)]
pub struct PptSlide {
    /// First non-placeholder paragraph (the slide title in common files).
    pub title: String,
    /// Remaining paragraphs (body outlines, etc.).
    pub body: Vec<String>,
}

/// Result of reading a .ppt file.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PptDocument {
    pub slides: Vec<PptSlide>,
}

const RT_SLIDE_CONTAINER: u16 = 0x03F8;
const RT_MASTER_CONTAINER: u16 = 0x03EE;
const RT_TEXT_CHARS: u16 = 0x0FA0;
const RT_TEXT_BYTES: u16 = 0x0FA8;

/// Parse the `PowerPoint Document` OLE stream into ordered slide text.
/// Never fails: unknown records are skipped, so it accepts any byte blob.
pub fn parse_ppt_text(stream: &[u8]) -> PptDocument {
    let mut slides = Vec::new();
    scan(stream, &mut slides);
    PptDocument { slides }
}

/// Walk the record tree; slide containers emit one slide each.
fn scan(d: &[u8], slides: &mut Vec<PptSlide>) {
    let mut pos = 0usize;
    while pos + 8 <= d.len() {
        let recver = d[pos] & 0x0F;
        let rectype = u16::from_le_bytes([d[pos + 2], d[pos + 3]]);
        let reclen = u32::from_le_bytes([d[pos + 4], d[pos + 5], d[pos + 6], d[pos + 7]]) as usize;
        if reclen == 0 || pos + 8 + reclen > d.len() {
            break;
        }
        if recver == 0xF {
            let body = &d[pos + 8..pos + 8 + reclen];
            match rectype {
                RT_SLIDE_CONTAINER | RT_MASTER_CONTAINER => {
                    if let Some(slide) = slide_from_container(body) {
                        slides.push(slide);
                    }
                }
                _ => scan(body, slides),
            }
        }
        pos += 8 + reclen;
    }
}

/// Collect the text atoms of one slide container (any nesting depth).
fn slide_from_container(d: &[u8]) -> Option<PptSlide> {
    let mut texts = Vec::new();
    collect_texts(d, &mut texts);
    // Trim + drop placeholders/empties that slipped through.
    let mut real: Vec<String> = texts
        .into_iter()
        .filter_map(|mut s| {
            s = s.trim().to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        })
        .filter(|s| !is_placeholder(s))
        .collect();
    if real.is_empty() {
        return None;
    }
    let title = real.remove(0);
    Some(PptSlide { title, body: real })
}

fn collect_texts(d: &[u8], out: &mut Vec<String>) {
    let mut pos = 0usize;
    while pos + 8 <= d.len() {
        let recver = d[pos] & 0x0F;
        let rectype = u16::from_le_bytes([d[pos + 2], d[pos + 3]]);
        let reclen = u32::from_le_bytes([d[pos + 4], d[pos + 5], d[pos + 6], d[pos + 7]]) as usize;
        if reclen == 0 || pos + 8 + reclen > d.len() {
            break;
        }
        match rectype {
            RT_TEXT_CHARS => {
                let par = utf16le_to_string(&d[pos + 8..pos + 8 + reclen]);
                if !is_placeholder(&par) {
                    out.push(par);
                }
            }
            RT_TEXT_BYTES => {
                let par = String::from_utf8_lossy(&d[pos + 8..pos + 8 + reclen]).into_owned();
                if !is_placeholder(&par) {
                    out.push(par);
                }
            }
            _ => {}
        }
        if recver == 0xF {
            collect_texts(&d[pos + 8..pos + 8 + reclen], out);
        }
        pos += 8 + reclen;
    }
}

fn utf16le_to_string(bytes: &[u8]) -> String {
    bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|c| {
            let u = u16::from_le_bytes([c[0], c[1]]);
            char::from_u32(u as u32).unwrap_or('\u{FFFD}')
        })
        .collect()
}

/// Master/layout placeholder text: "Click to edit ...", lone "*", empty.
fn is_placeholder(s: &str) -> bool {
    let t = s.trim();
    t.is_empty()
        || t == "*"
        || t == "-"
        || t.starts_with("Click to edit")
        || t.starts_with("Click to add")
        || t == "Title"
        || t == "Subtitle"
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a record: u8(recVer:4,recInst:4) u8(recInst2) u16(recType) u32(len).
    fn rec(reciver: u8, rectype: u16, body: &[u8]) -> Vec<u8> {
        let mut v = Vec::new();
        v.push(reciver);
        v.push(0x00); // recInstance2 = 0
        v.extend_from_slice(&rectype.to_le_bytes());
        v.extend_from_slice(&(body.len() as u32).to_le_bytes());
        v.extend_from_slice(body);
        v
    }

    fn text_chars(s: &str) -> Vec<u8> {
        let mut b = Vec::new();
        for u in s.encode_utf16() {
            b.extend_from_slice(&u.to_le_bytes());
        }
        rec(0x00, RT_TEXT_CHARS, &b)
    }

    fn text_header(inst: u8) -> Vec<u8> {
        // TextHeaderAtom body is 4 bytes (placeholder text type).
        rec(0x00, 0x0F9F, &i32::to_le_bytes(inst as i32))
    }

    #[test]
    fn parses_real_slides_and_filters_layouts() {
        // Document container: layout container (placeholder text only) then
        // two real slide containers with title + body.
        let layout = {
            let mut b = text_header(0);
            b.extend(text_chars("Click to edit Master title style"));
            rec(0x0F, 0x03F8, &b)
        };
        let slide1 = {
            let mut b = text_header(0);
            b.extend(text_chars("Hello PPT"));
            b.extend(text_header(1));
            b.extend(text_chars("Second line"));
            rec(0x0F, 0x03F8, &b)
        };
        let slide2 = {
            let mut b = text_header(0);
            b.extend(text_chars("Bye"));
            b.extend(text_header(1));
            b.extend(text_chars("Last slide"));
            rec(0x0F, 0x03F8, &b)
        };
        let doc = {
            let mut b = layout;
            b.extend(slide1);
            b.extend(slide2);
            rec(0x0F, 0x03E8, &b)
        };
        let ppt = parse_ppt_text(&doc);
        assert_eq!(ppt.slides.len(), 2, "layouts filtered, slides kept");
        assert_eq!(ppt.slides[0].title, "Hello PPT");
        assert_eq!(ppt.slides[0].body, vec!["Second line".to_string()]);
        assert_eq!(ppt.slides[1].title, "Bye");
        assert_eq!(ppt.slides[1].body, vec!["Last slide".to_string()]);
    }

    #[test]
    fn ignores_text_bytes_atoms() {
        // TextBytesAtom (8-bit) should also be read.
        let slide = {
            let mut b = text_header(0);
            b.extend(rec(0x00, RT_TEXT_BYTES, b"Legacy bytes"));
            rec(0x0F, 0x03F8, &b)
        };
        let doc = rec(0x0F, 0x03E8, &slide);
        let ppt = parse_ppt_text(&doc);
        assert_eq!(ppt.slides.len(), 1);
        assert!(ppt.slides[0].title.contains("Legacy bytes"));
    }
}
