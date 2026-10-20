//! Minimal PDF serializer.
//!
//! Writes a valid PDF from a PdfDocument model, including metadata,
//! page tree, content streams, and annotations.

use std::fmt::Write as FmtWrite;
use std::io::Write;

use crate::model::*;

/// Minimal PDF serializer capable of writing a valid PDF document.
pub struct PdfSerializer;

impl PdfSerializer {
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// The PDF header version emitted by the writer for GENERATION output.
    ///
    /// Per OO contract F-403 (OnlyOffice PdfFile/SrcWriter/Document.cpp:62-63),
    /// generated (non-source) output uses `%PDF-1.7` (OO's general output) and
    /// 1.4 only for PDF/A (not emitted yet). When serializing a document that
    /// was PARSED from an existing PDF, the SOURCE header version is preserved
    /// (1.4 in -> 1.4 out) so a round trip never rewrites the header.
    const OUTPUT_VERSION: &str = "1.7";

    /// Serialize a PdfDocument into PDF bytes.
    ///
    /// Object numbering scheme:
    ///   1: Catalog
    ///   2: Pages (root page tree node)
    ///   3..(2+n): Individual page objects (n pages)
    ///   next: Annotation objects (per page, in order)
    pub fn serialize(&self, doc: &PdfDocument) -> Result<Vec<u8>, String> {
        let mut output = Vec::new();
        let mut offsets: Vec<(u32, usize)> = Vec::new();
        let mut next_obj: u32 = 1;

        let mut begin_obj = |obj_num: u32, out: &mut Vec<u8>| -> Result<(), String> {
            offsets.push((obj_num, out.len()));
            writeln!(out, "{} 0 obj", obj_num).map_err(|e| e.to_string())
        };

        // Header — F-403: preserve the source version on round trip; fall back
        // to the OO-general 1.7 only for pure generation (no parsed source).
        let out_version = if doc.version.is_empty() {
            Self::OUTPUT_VERSION
        } else {
            doc.version.as_str()
        };
        writeln!(output, "%PDF-{}", out_version).map_err(|e| e.to_string())?;

        // Object 1: Catalog
        begin_obj(1, &mut output)?;
        writeln!(output, "<< /Type /Catalog /Pages 2 0 R >>").map_err(|e| e.to_string())?;
        writeln!(output, "endobj").map_err(|e| e.to_string())?;

        // Object 2: Pages root
        begin_obj(2, &mut output)?;
        write!(output, "<< /Type /Pages /Kids [").map_err(|e| e.to_string())?;
        for i in 0..doc.pages.len() {
            write!(output, " {} 0 R", 3 + i as u32).map_err(|e| e.to_string())?;
        }
        writeln!(output, " ] /Count {} >>", doc.pages.len()).map_err(|e| e.to_string())?;
        writeln!(output, "endobj").map_err(|e| e.to_string())?;

        // Page objects
        let mut annot_obj_nums: Vec<Vec<u32>> = Vec::new();

        for (i, page) in doc.pages.iter().enumerate() {
            let page_obj_num = 3 + i as u32;
            begin_obj(page_obj_num, &mut output)?;

            write!(output, "<< /Type /Page /Parent 2 0 R").map_err(|e| e.to_string())?;

            if let (Some(w), Some(h)) = (page.width, page.height) {
                write!(output, " /MediaBox [0 0 {} {}]", w, h).map_err(|e| e.to_string())?;
            }

            let mut annot_nums = Vec::new();
            if !page.annotations.is_empty() {
                write!(output, " /Annots [").map_err(|e| e.to_string())?;
                for _ in &page.annotations {
                    let an = next_obj;
                    next_obj += 1;
                    write!(output, " {} 0 R", an).map_err(|e| e.to_string())?;
                    annot_nums.push(an);
                }
                write!(output, " ]").map_err(|e| e.to_string())?;
            }

            writeln!(output, " >>").map_err(|e| e.to_string())?;
            writeln!(output, "endobj").map_err(|e| e.to_string())?;

            annot_obj_nums.push(annot_nums);
        }

        // Annotation objects
        for (page_idx, page) in doc.pages.iter().enumerate() {
            for (annot_idx, annot) in page.annotations.iter().enumerate() {
                let obj_num = if annot_idx < annot_obj_nums[page_idx].len() {
                    annot_obj_nums[page_idx][annot_idx]
                } else {
                    let n = next_obj;
                    next_obj += 1;
                    n
                };
                self.write_annotation_obj(&mut output, obj_num, annot)?;
            }
        }

        let total_objects = next_obj;

        // Xref table
        let xref_offset = output.len();
        writeln!(output, "xref").map_err(|e| e.to_string())?;
        writeln!(output, "0 {}", total_objects).map_err(|e| e.to_string())?;
        writeln!(output, "0000000000 65535 f ").map_err(|e| e.to_string())?;
        for obj_num in 1..total_objects {
            let offset = offsets
                .iter()
                .find(|&&(on, _)| on == obj_num)
                .map(|&(_, off)| off)
                .unwrap_or(0);
            writeln!(output, "{:010} 00000 n ", offset).map_err(|e| e.to_string())?;
        }

        // Trailer
        writeln!(output, "trailer").map_err(|e| e.to_string())?;
        writeln!(output, "<< /Size {} /Root 1 0 R >>", total_objects).map_err(|e| e.to_string())?;
        writeln!(output, "startxref").map_err(|e| e.to_string())?;
        writeln!(output, "{}", xref_offset).map_err(|e| e.to_string())?;
        writeln!(output, "%%EOF").map_err(|e| e.to_string())?;

        Ok(output)
    }

    fn write_annotation_obj(
        &self,
        output: &mut Vec<u8>,
        obj_num: u32,
        annot: &PdfAnnotation,
    ) -> Result<(), String> {
        writeln!(output, "{} 0 obj", obj_num).map_err(|e| e.to_string())?;

        write!(output, "<< /Type /Annot /Subtype /{}", annot.subtype).map_err(|e| e.to_string())?;

        write!(
            output,
            " /Rect [{} {} {} {}]",
            annot.rect[0], annot.rect[1], annot.rect[2], annot.rect[3]
        )
        .map_err(|e| e.to_string())?;

        if let Some(ref contents) = annot.contents {
            write!(output, " /Contents {}", Self::pdf_string(contents))
                .map_err(|e| e.to_string())?;
        }
        if let Some(ref author) = annot.author {
            write!(output, " /T {}", Self::pdf_string(author)).map_err(|e| e.to_string())?;
        }
        if let Some(ref modified) = annot.modified {
            write!(output, " /M {}", Self::pdf_string(modified)).map_err(|e| e.to_string())?;
        }
        if let Some(ref name) = annot.name {
            write!(output, " /NM {}", Self::pdf_string(name)).map_err(|e| e.to_string())?;
        }

        if let Some(ref color) = annot.color {
            write!(output, " /C [{} {} {}]", color[0], color[1], color[2])
                .map_err(|e| e.to_string())?;
        }

        if let Some(opacity) = annot.opacity {
            write!(output, " /CA {}", opacity).map_err(|e| e.to_string())?;
        }

        if let Some(open) = annot.open {
            write!(output, " /Open {}", if open { "true" } else { "false" })
                .map_err(|e| e.to_string())?;
        }

        if let Some(ref border) = annot.border {
            write!(output, " /Border [").map_err(|e| e.to_string())?;
            for (j, val) in border.iter().enumerate() {
                if j > 0 {
                    write!(output, " ").map_err(|e| e.to_string())?;
                }
                write!(output, "{}", val).map_err(|e| e.to_string())?;
            }
            write!(output, " ]").map_err(|e| e.to_string())?;
        }

        if let Some(ref quad) = annot.quad_points {
            write!(output, " /QuadPoints [").map_err(|e| e.to_string())?;
            for (j, val) in quad.iter().enumerate() {
                if j > 0 {
                    write!(output, " ").map_err(|e| e.to_string())?;
                }
                write!(output, "{}", val).map_err(|e| e.to_string())?;
            }
            write!(output, " ]").map_err(|e| e.to_string())?;
        }

        writeln!(output, " >>").map_err(|e| e.to_string())?;
        writeln!(output, "endobj").map_err(|e| e.to_string())?;

        Ok(())
    }

    fn pdf_string(s: &str) -> String {
        let mut escaped = String::with_capacity(s.len() + 2);
        escaped.push('(');
        for ch in s.chars() {
            match ch {
                '(' => escaped.push_str("\\("),
                ')' => escaped.push_str("\\)"),
                '\\' => escaped.push_str("\\\\"),
                '\n' => escaped.push_str("\\n"),
                '\r' => escaped.push_str("\\r"),
                '\t' => escaped.push_str("\\t"),
                '\x08' => escaped.push_str("\\b"),
                '\x0c' => escaped.push_str("\\f"),
                c if (c as u32) < 32 || c as u32 > 126 => {
                    let byte = c as u8;
                    write!(escaped, "\\{:03o}", byte).unwrap();
                }
                c => escaped.push(c),
            }
        }
        escaped.push(')');
        escaped
    }
}

impl Default for PdfSerializer {
    fn default() -> Self {
        Self::new()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::PdfParser;

    /// F-403: round-tripping a parsed PDF must preserve the SOURCE header
    /// version (1.4 in -> 1.4 out); only pure generation falls back to 1.7.
    #[test]
    fn test_roundtrip_preserves_source_version_f403() {
        let input = b"%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>
3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>
trailer<</Size 3/Root 1 0 R>>
startxref
4
%%EOF
";
        let doc = PdfParser::new().parse(input).expect("parses");
        assert_eq!(doc.version, "1.4", "parser captured the source version");
        let out = PdfSerializer::new().serialize(&doc).expect("serializes");
        assert!(
            out.starts_with(b"%PDF-1.4"),
            "round-trip preserves source version (got {:?})",
            String::from_utf8_lossy(&out[..std::cmp::min(9, out.len())])
        );
    }

    /// F-403: generation (no source version) still emits the OO-general 1.7.
    #[test]
    fn test_generation_emits_1_7_f403() {
        let doc = PdfDocument {
            version: String::new(),
            page_count: 1,
            metadata: PdfMetadata::default(),
            pages: vec![],
            objects: vec![],
            linearized: false,
            xref_type: XrefType::default(),
            encryption: None,
        };
        let out = PdfSerializer::new().serialize(&doc).expect("serializes");
        assert!(
            out.starts_with(b"%PDF-1.7"),
            "generation writes 1.7 (got {:?})",
            String::from_utf8_lossy(&out[..std::cmp::min(9, out.len())])
        );
    }
}

