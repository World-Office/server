//! DOCX helpers for the editor document API: minimal blank-document
//! creation and `w:documentProtection` read/write (port of the Python
//! docserver's `_write_doc_protection` / `_doc_protection_detail`).
//!
//! Protection lives in the DOCX file itself — `word/settings.xml`
//! `w:documentProtection` element — so a restricted document refuses
//! content saves until protection is lifted here.

use crate::AppError;
use hmac::{Hmac, Mac};
use sha2::Sha512;

/// PBKDF2-HMAC-SHA512 parameters, matching the Python reference
/// (`wopi/auth.py`): 100k iterations (OWASP floor), 32-byte derived key,
/// 16-byte random salt — the derived value is stored in
/// `w:documentProtection`, never the password.
const PROTECTION_ITERATIONS: u32 = 100_000;
const PROTECTION_DKLEN: usize = 32;
const PROTECTION_SALT_LEN: usize = 16;

type HmacSha512 = Hmac<Sha512>;

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

/// Derive `(salt_hex, hash_hex)` for a protection password. A fresh random
/// salt is minted unless one is supplied (the verify path reuses the stored
/// salt).
pub fn hash_protection_password(password: &str, salt_hex: Option<&str>) -> (String, String) {
    let salt_hex = salt_hex.map(str::to_string).unwrap_or_else(|| {
        let mut b = [0u8; PROTECTION_SALT_LEN];
        getrandom::getrandom(&mut b).expect("os rng unavailable");
        to_hex(&b)
    });
    let salt = from_hex(&salt_hex).unwrap_or_default();
    let mut dk = [0u8; PROTECTION_DKLEN];
    pbkdf2_fill(password.as_bytes(), &salt, PROTECTION_ITERATIONS, &mut dk);
    (salt_hex, to_hex(&dk))
}

/// Constant-time check of a supplied password against a stored hash.
pub fn verify_protection_password(password: &str, salt_hex: &str, hash_hex: &str) -> bool {
    if password.is_empty() || salt_hex.is_empty() || hash_hex.is_empty() {
        return false;
    }
    let Some(salt) = from_hex(salt_hex) else {
        return false;
    };
    let mut dk = [0u8; PROTECTION_DKLEN];
    pbkdf2_fill(password.as_bytes(), &salt, PROTECTION_ITERATIONS, &mut dk);
    let expected = to_hex(&dk);
    let a = expected.as_bytes();
    let b = hash_hex.to_ascii_lowercase();
    let b = b.as_bytes();
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn pbkdf2_fill(password: &[u8], salt: &[u8], iterations: u32, out: &mut [u8]) {
    // Single-block PBKDF2 (out.len() <= 64): U1 = PRF(P, S || INT(1)),
    // Un = PRF(P, U(n-1)), T = U1 xor U2 xor ... xor Uc.
    let mut mac = HmacSha512::new_from_slice(password).expect("hmac accepts any key length");
    mac.update(salt);
    mac.update(&1u32.to_be_bytes());
    let mut u: [u8; 64] = mac.finalize().into_bytes().into();
    let mut t = u;
    for _ in 1..iterations {
        let mut mac = HmacSha512::new_from_slice(password).expect("hmac accepts any key length");
        mac.update(&u);
        u = mac.finalize().into_bytes().into();
        for (a, b) in t.iter_mut().zip(u.iter()) {
            *a ^= *b;
        }
    }
    out.copy_from_slice(&t[..out.len()]);
}

/// True when the stored bytes carry an active `w:documentProtection`
/// (edit != "none"). Any parse failure yields the unprotected default so
/// enforcement only ever engages on a valid stored DOCX.
pub fn is_restricted(data: &[u8]) -> bool {
    protection_detail(data)["restricted"]
        .as_bool()
        .unwrap_or(false)
}

/// Read {edit, restricted, password_set} from a stored DOCX.
pub fn protection_detail(data: &[u8]) -> serde_json::Value {
    let mut detail = serde_json::json!({
        "edit": "none", "restricted": false, "password_set": false,
        "salt": serde_json::Value::Null, "hash": serde_json::Value::Null,
    });
    let Some(xml) = settings_xml(data) else {
        return detail;
    };
    // Cheap string scan (roxmltree is not a writer and only supports UTF-8;
    // the element is short and well-formed in files our own pipeline writes
    // and in real-world files where it appears).
    let Some(start) = xml.find("w:documentProtection") else {
        return detail;
    };
    let rest = &xml[start..];
    let seg = &rest[..rest.find('>').unwrap_or(rest.len())];
    let edit = attr(seg, "w:edit")
        .unwrap_or_else(|| "none".into())
        .to_ascii_lowercase();
    let hash = attr(seg, "w:hash");
    let salt = attr(seg, "w:salt");
    detail["edit"] = serde_json::Value::String(edit.clone());
    detail["restricted"] = serde_json::Value::Bool(edit != "none");
    detail["password_set"] = serde_json::Value::Bool(hash.is_some());
    detail["hash"] = hash.map_or(serde_json::Value::Null, serde_json::Value::String);
    detail["salt"] = salt.map_or(serde_json::Value::Null, serde_json::Value::String);
    detail
}

/// Rewrite the stored DOCX so `word/settings.xml` carries a
/// `w:documentProtection` element (restrict) or none (lift).
pub fn write_protection(
    data: &[u8],
    restrict: bool,
    salt_hex: Option<&str>,
    hash_hex: Option<&str>,
) -> Result<Vec<u8>, AppError> {
    // Rebuild the OOXML package, byte-preserving every part except
    // settings.xml (which we rewrite) and [Content_Types].xml (unchanged:
    // settings is already overridden; if missing we add the override).
    let cursor = std::io::Cursor::new(data);
    let mut zip = zip::ZipArchive::new(cursor)
        .map_err(|e| AppError::InternalError(format!("opc read: {e}")))?;
    let mut out: Vec<(String, Vec<u8>)> = Vec::new();
    let mut has_settings = false;
    let mut content_types_has_override = false;

    for i in 0..zip.len() {
        let mut file = zip
            .by_index(i)
            .map_err(|e| AppError::InternalError(format!("opc entry: {e}")))?;
        let name = file.name().to_string();
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut bytes)
            .map_err(|e| AppError::InternalError(format!("opc read: {e}")))?;

        if name == "word/settings.xml" {
            has_settings = true;
            let mut xml = String::from_utf8_lossy(&bytes).into_owned();
            rewrite_document_protection(&mut xml, restrict, salt_hex, hash_hex);
            bytes = xml.into_bytes();
        } else if name == "[Content_Types].xml" {
            content_types_has_override = bytes
                .windows(b"settings.xml".len())
                .any(|w| w == b"settings.xml");
        }
        // OOXML zips sometimes carry duplicate entry names; ZipWriter
        // rejects duplicates, so last wins.
        if let Some(existing) = out.iter_mut().find(|(n, _)| *n == name) {
            existing.1 = bytes;
        } else {
            out.push((name, bytes));
        }
    }

    if !has_settings {
        // New settings part (rare): add a minimal settings.xml with the
        // element in place and register the override.
        let mut settings = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">"#
            .to_string();
        if restrict {
            settings.push_str(&protection_element(salt_hex, hash_hex));
        }
        settings.push_str("</w:settings>");
        out.push(("word/settings.xml".into(), settings.into_bytes()));
        if !content_types_has_override {
            // patch the existing [Content_Types].xml in place — never a
            // duplicate entry (ZipWriter rejects re-started names)
            let existing = out
                .iter()
                .find(|(n, _)| n == "[Content_Types].xml")
                .map(|(_, b)| String::from_utf8_lossy(b).into_owned())
                .unwrap_or_default();
            let ct = add_settings_override(&existing);
            if let Some(slot) = out.iter_mut().find(|(n, _)| n == "[Content_Types].xml") {
                slot.1 = ct.into_bytes();
            } else {
                out.push(("[Content_Types].xml".into(), ct.into_bytes()));
            }
        }
    }

    // Re-Zip preserving original entry order.
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (name, bytes) in &out {
        writer
            .start_file(name.as_str(), options)
            .map_err(|e| AppError::InternalError(format!("opc write: {e}")))?;
        std::io::Write::write_all(&mut writer, bytes)
            .map_err(|e| AppError::InternalError(format!("opc write: {e}")))?;
    }
    let inner = writer
        .finish()
        .map_err(|e| AppError::InternalError(format!("opc finalize: {e}")))?;
    Ok(inner.into_inner())
}

fn settings_xml(data: &[u8]) -> Option<String> {
    let cursor = std::io::Cursor::new(data);
    let mut zip = zip::ZipArchive::new(cursor).ok()?;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).ok()?;
        if file.name() == "word/settings.xml" {
            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut file, &mut bytes).ok()?;
            return Some(String::from_utf8_lossy(&bytes).into_owned());
        }
    }
    None
}

fn attr(seg: &str, name: &str) -> Option<String> {
    // find `name="value"` (or name='value')
    for q in ['"', '\''] {
        let pat = format!("{name}={q}");
        if let Some(i) = seg.find(&pat) {
            let tail = &seg[i + pat.len()..];
            if let Some(j) = tail.find(q) {
                return Some(tail[..j].to_string());
            }
        }
    }
    None
}

fn protection_element(salt_hex: Option<&str>, hash_hex: Option<&str>) -> String {
    let mut el = r#"<w:documentProtection w:edit="readOnly" w:enforcement="1""#.to_string();
    if let (Some(salt), Some(hash)) = (salt_hex, hash_hex) {
        el.push_str(&format!(
            r##" w:cryptProviderType="rsaFull" w:cryptAlgorithmClass="hash"
          w:cryptAlgorithmType="typeAny" w:cryptAlgorithmSid="14"
          w:cryptSpinCount="100000" w:hash="{hash}" w:salt="{salt}""##
        ));
    }
    el.push_str("/>");
    el
}

/// Replace or remove the `w:documentProtection` element in settings.xml.
fn rewrite_document_protection(
    xml: &mut String,
    restrict: bool,
    salt_hex: Option<&str>,
    hash_hex: Option<&str>,
) {
    let lower = xml.to_ascii_lowercase();
    if let Some(start) = lower.find("<w:documentprotection") {
        let seg = &lower[start..];
        let seg_end = seg.find('>').unwrap_or(seg.len());
        if let Some(end_rev) = seg.find("/>") {
            if end_rev < seg_end {
                // self-closing element: drop exactly it
                xml.replace_range(start..start + end_rev + 2, "");
            } else {
                // open/closing pair: drop through </w:documentProtection>
                let after = start + seg_end + 1;
                let tail_lower = lower[after..].to_ascii_lowercase();
                let close = tail_lower.find("</w:documentprotection>").unwrap_or(0);
                xml.replace_range(start..after + close + 23, "");
            }
        } else {
            let after = start + seg_end + 1;
            let tail_lower = lower[after..].to_ascii_lowercase();
            let close = tail_lower.find("</w:documentprotection>").unwrap_or(0);
            xml.replace_range(start..after + close + 23, "");
        }
    }
    if restrict {
        // insert right after the settings root open tag
        let needle = "<w:settings";
        if let Some(root) = xml.find(needle) {
            if let Some(gt) = xml[root..].find('>') {
                xml.insert_str(root + gt + 1, &protection_element(salt_hex, hash_hex));
            }
        }
    }
}

fn add_settings_override(content_types: &str) -> String {
    let override_xml = r#"<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>"#;
    if content_types.contains("settings.xml") {
        return content_types.to_string();
    }
    // Insert before the closing </Types>
    if let Some(pos) = content_types.rfind("</Types>") {
        let mut out = content_types.to_string();
        out.insert_str(pos, override_xml);
        out
    } else {
        format!(
            r#"<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">{override_xml}</Types>"#
        )
    }
}

/// Minimal valid blank DOCX package (used by POST /api/documents/new).
pub fn blank_docx() -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let parts: Vec<(&str, &str)> = vec![
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>"#,
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
        ),
        (
            "word/document.xml",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t> </w:t></w:r></w:p></w:body></w:document>"#,
        ),
        (
            "word/settings.xml",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:settings>"#,
        ),
    ];
    for (name, content) in parts {
        writer.start_file(name, options).unwrap();
        std::io::Write::write_all(&mut writer, content.as_bytes()).unwrap();
    }
    let cursor = writer.finish().unwrap();
    cursor.into_inner()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pbkdf2_sha512_matches_reference_vectors() {
        // dkLen=64 known-answer tests for PBKDF2-HMAC-SHA512.
        let mut out = [0u8; 64];
        pbkdf2_fill(b"password", b"salt", 1, &mut out);
        assert_eq!(
            to_hex(&out),
            "867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252\
             c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce"
        );
        pbkdf2_fill(b"password", b"salt", 2, &mut out);
        assert_eq!(
            to_hex(&out),
            "e1d9c16aa681708a45f5c7c4e215ceb66e011a2e9f0040713f18aefdb866d53c\
             f76cab2868a39b9f7840edce4fef5a82be67335c77a6068e04112754f27ccf4e"
        );
    }

    #[test]
    fn hash_and_verify_match_python_reference() {
        // Vector produced by Python: hashlib.pbkdf2_hmac('sha512', b'correct
        // horse', bytes.fromhex(salt), 100000, dklen=32).hex() — proves the
        // Rust port derives the same stored hash as the Python docserver
        // (same KDF, iteration count, key length and hex encoding).
        let salt = "00112233445566778899aabbccddeeff";
        let (s, h) = hash_protection_password("correct horse", Some(salt));
        assert_eq!(s, salt);
        assert_eq!(
            h,
            "db266a45f5c8e9f48a227da7019d8cb2cceb82d82dae8f2df8f18feb2c281cc9"
        );
        assert!(verify_protection_password("correct horse", salt, &h));
        assert!(
            !verify_protection_password("wrong horse", salt, &h),
            "must reject wrong password"
        );
    }

    #[test]
    fn blank_docx_is_openable_and_unrestricted() {
        let doc = blank_docx();
        assert!(!is_restricted(&doc));
        assert_eq!(protection_detail(&doc)["edit"], "none");
    }

    #[test]
    fn protection_detail_exposes_salt_and_hash() {
        // Fixed vector (no PBKDF2 derivation needed here — that is covered
        // by the Python-parity test above).
        let doc = blank_docx();
        let salt = "00112233445566778899aabbccddeeff";
        let hash = "db266a45f5c8e9f48a227da7019d8cb2cceb82d82dae8f2df8f18feb2c281cc9";
        let protected = write_protection(&doc, true, Some(salt), Some(hash)).unwrap();
        let d = protection_detail(&protected);
        assert!(d["password_set"].as_bool().unwrap());
        assert_eq!(d["salt"], salt);
        assert_eq!(d["hash"], hash);
        assert!(verify_protection_password("correct horse", salt, hash));
    }

    #[test]
    fn protect_roundtrip_flips_restriction() {
        let doc = blank_docx();
        let restricted = write_protection(&doc, true, Some("salt01"), Some("hash02")).unwrap();
        assert!(
            is_restricted(&restricted),
            "must be restricted after protect"
        );
        assert!(protection_detail(&restricted)["password_set"]
            .as_bool()
            .unwrap());
        let lifted = write_protection(&restricted, false, None, None).unwrap();
        assert!(!is_restricted(&lifted), "lifting must drop enforcement");
        // round-trip through the converter must still be a valid docx
        let router = wo_x2t::ConversionRouter::new();
        let out = router.convert("docx", "html", &restricted);
        assert!(
            matches!(
                out.status,
                wo_x2t::ConversionStatus::Success | wo_x2t::ConversionStatus::PartialSuccess
            ),
            "protected docx must still convert: {:?}",
            out.status
        );
    }
}
