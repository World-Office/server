//! ECMA-376 password-protected OOXML (MS-OFFCRYPTO) — read path, F-501.
//!
//! A password-protected `.docx` / `.xlsx` / `.pptx` is not a ZIP: it is an
//! OLE/CFB container holding an `EncryptionInfo` stream (describing the
//! scheme) and an `EncryptedPackage` stream (the real package, encrypted).
//! Decryption is delegated to the `msoffice-crypto` crate (agile + standard
//! encryption, verifier checked); this module owns the OOXML-only surface
//! and the loud wrong-password / not-encrypted errors.

use crate::ole::OleCompoundDoc;
use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum OoxmlDecryptError {
    #[error("the document is not password-protected (no EncryptionInfo/EncryptedPackage streams)")]
    NotEncrypted,
    #[error(
        "wrong password: this ECMA-376-protected document did not decrypt with the given password"
    )]
    WrongPassword,
    #[error("unsupported encryption scheme: {0}")]
    Unsupported(String),
    #[error("invalid protected document: {0}")]
    Invalid(String),
}

/// True if `data` is an OLE/CFB container with the two ECMA-376 encryption
/// streams (`EncryptionInfo` + `EncryptedPackage`) — i.e. a password-protected
/// OOXML package.
pub fn is_encrypted_ooxml(data: &[u8]) -> bool {
    let Ok(doc) = OleCompoundDoc::parse(data) else {
        return false;
    };
    let streams = doc.list_streams();
    streams.iter().any(|s| s == "EncryptionInfo") && streams.iter().any(|s| s == "EncryptedPackage")
}

/// Decrypt a password-protected OOXML package back to its plain ZIP bytes.
/// Loud and specific on the two common failures: wrong password and "not
/// actually encrypted".
#[cfg(not(target_arch = "wasm32"))]
pub fn decrypt_ooxml(data: &[u8], password: &str) -> Result<Vec<u8>, OoxmlDecryptError> {
    if !is_encrypted_ooxml(data) {
        return Err(OoxmlDecryptError::NotEncrypted);
    }
    msoffice_crypto::decrypt_ooxml(data, password).map_err(map_error)
}

/// wasm32: msoffice-crypto rc.5 does not compile on wasm (web_time/std
/// SystemTime mismatch in its dataspaces.rs), and in-browser password
/// decryption is not a supported path — surface Unsupported, never panic.
#[cfg(target_arch = "wasm32")]
pub fn decrypt_ooxml(_data: &[u8], _password: &str) -> Result<Vec<u8>, OoxmlDecryptError> {
    Err(OoxmlDecryptError::Unsupported(
        "password-protected OOXML decryption is not available on wasm".into(),
    ))
}

#[cfg(not(target_arch = "wasm32"))]
fn map_error(e: msoffice_crypto::Error) -> OoxmlDecryptError {
    match e {
        msoffice_crypto::Error::WrongPassword => OoxmlDecryptError::WrongPassword,
        other => {
            let msg = other.to_string().to_lowercase();
            if msg.contains("unsupported") || msg.contains("unimplemented") {
                OoxmlDecryptError::Unsupported(other.to_string())
            } else {
                OoxmlDecryptError::Invalid(other.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_zip_is_not_encrypted_ooxml() {
        let zip = b"PK\x03\x04 some zip bytes that are not a CFB container";
        assert!(!is_encrypted_ooxml(zip));
        assert_eq!(
            decrypt_ooxml(zip, "pw"),
            Err(OoxmlDecryptError::NotEncrypted)
        );
    }

    #[test]
    fn encrypted_fixture_roundtrip_and_loud_wrong_password() {
        let base =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../wo-x2t/tests/fixtures");
        for (name, pw) in [
            // agile (Office 2010+), from msoffcrypto-tool test corpus
            ("protected-agile.docx", "Password1234_"),
            // standard (Office 2007), from msoffcrypto-tool test corpus
            ("protected-standard.docx", "Password1234_"),
        ] {
            let data = std::fs::read(base.join(name)).expect("fixture present");
            assert!(is_encrypted_ooxml(&data), "{name} detected as encrypted");
            let decrypted = decrypt_ooxml(&data, pw).expect("{name} decrypts with right pw");
            assert_eq!(&decrypted[..4], b"PK\x03\x04", "{name} yields a zip");
            assert_eq!(
                decrypt_ooxml(&data, "WrongPass99"),
                Err(OoxmlDecryptError::WrongPassword),
                "{name} loud wrong-password"
            );
        }
    }
}
