#[cfg(test)]
use super::*;

/// Round-trip save fidelity: serialize_document must merge the edited
/// word/document.xml into the ORIGINAL package so that parts the editor
/// model can't represent (styles, theme, fonts, media, numbering, app.xml,
/// customXml, thumbnail) survive an edit+save cycle.
///
/// The original file bytes live in DOC_STORE from create_docx_model.
mod serialize_merge_tests {
    #[allow(unused_imports)]
    use super::*;

    use std::io::{Cursor, Read, Write};

    use wo_ooxml::model::{DocxBlock, DocxParagraph, DocxRun, OoxmlDocument};
    use wo_ooxml::parser::OoxmlParser;
    use wo_ooxml::serializer::OoxmlSerializer;

    /// Build a docx with the standard 6 serializer parts PLUS extras that the
    /// engine cannot represent, mimicking a real-world rich document.
    fn rich_original() -> Vec<u8> {
        let mut doc = OoxmlDocument {
            format: wo_ooxml::model::OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: Vec::new(),
            main_part: None,
            shared_strings: Vec::new(),
            part_count: 0,
            core_properties: Default::default(),
            relationships: Vec::new(),
            docx_body: None,
            xlsx_workbook: None,
        };
        doc.docx_body = Some(wo_ooxml::model::DocxBody {
            blocks: vec![DocxBlock::Paragraph(DocxParagraph {
                runs: vec![DocxRun { text: "hello".into(), ..Default::default() }],
                ..Default::default()
            })],
            ..Default::default()
        });
        let base = OoxmlSerializer::new().serialize(&doc).expect("serialize base");

        let reader = Cursor::new(base);
        let mut in_zip = zip::ZipArchive::new(reader).expect("open base zip");
        let mut buf = Cursor::new(Vec::new());
        let mut out = zip::ZipWriter::new(&mut buf);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for i in 0..in_zip.len() {
            let mut f = in_zip.by_index(i).expect("entry");
            let name = f.name().to_string();
            let mut bytes = Vec::new();
            f.read_to_end(&mut bytes).expect("read entry");
            out.start_file(name, opts).expect("start");
            out.write_all(&bytes).expect("write");
        }
        // Parts the engine cannot model — must survive the save round-trip.
        out.start_file("word/theme/theme1.xml", opts).unwrap();
        out.write_all(b"<theme/>").unwrap();
        out.start_file("word/media/image1.png", opts).unwrap();
        out.write_all(b"\x89PNG-fake").unwrap();
        out.start_file("word/numbering.xml", opts).unwrap();
        out.write_all(b"<numbering/>").unwrap();
        out.finish().expect("finish");
        buf.into_inner()
    }

    fn part_names(bytes: &[u8]) -> Vec<String> {
        let z = zip::ZipArchive::new(Cursor::new(bytes.to_vec())).expect("zip");
        z.file_names().map(|s| s.to_string()).collect()
    }

    fn part(bytes: &[u8], name: &str) -> String {
        let mut z = zip::ZipArchive::new(Cursor::new(bytes.to_vec())).expect("zip");
        let mut f = z.by_name(name).expect("part exists");
        let mut s = String::new();
        f.read_to_string(&mut s).unwrap();
        s
    }

    #[test]
    fn save_preserves_unmodeled_parts_and_edits_document_xml() {
        let original = rich_original();

        // open → edit one char, exactly like the browser does
        let parser = OoxmlParser::new();
        let ooxml = parser.parse(&original).expect("parse");
        let handle = unsafe { next_doc_handle() };
        DOC_STORE
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap()
            .insert(handle, original.clone());
        DOC_MODEL_STORE
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap()
            .insert(handle, ooxml);
        set_cursor(handle, CursorPos { page: 0, para: 0, line: 0, char_idx: 5, x: 0.0, y: 0.0 });
        insert_text(handle, "X", "A4", "portrait", 72.0).expect("insert");

        let saved = serialize_document(handle).expect("serialize");

        // edits present
        assert!(part(&saved, "word/document.xml").contains('X'), "edit must land");
        // unmodeled parts preserved from the original package
        for p in ["word/theme/theme1.xml", "word/media/image1.png", "word/numbering.xml"] {
            assert!(
                part_names(&saved).contains(&p.to_string()),
                "part {p} must survive the save"
            );
        }
        assert_eq!(part(&saved, "word/theme/theme1.xml"), "<theme/>");
        release_document(handle).ok();
    }

    #[test]
    fn save_falls_back_to_minimal_when_no_original_bytes() {
        // handle created without create_docx_model (no DOC_STORE entry):
        // serialize_document must still return a valid minimal docx.
        let handle = 7042u32;
        let doc = OoxmlDocument {
            format: wo_ooxml::model::OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: Vec::new(),
            main_part: None,
            shared_strings: Vec::new(),
            part_count: 0,
            core_properties: Default::default(),
            relationships: Vec::new(),
            docx_body: None,
            xlsx_workbook: None,
        };
        DOC_MODEL_STORE
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap()
            .insert(handle, doc);
        let saved = serialize_document(handle).expect("serialize");
        assert!(part_names(&saved).contains(&"word/document.xml".to_string()));
        release_document(handle).ok();
    }
}
