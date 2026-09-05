//! OnlyOffice Document Server as a rendering oracle.
//!
//! Geometry is obtained **via PDF export**, not by patching `sdkjs`:
//!
//! ```text
//! docx/odt bytes ──► Document Server /converter ──► PDF ──► PdfGeometrySource ──► NormalizedRender
//! ```
//!
//! The Document Server conversion API requires the input document to be
//! reachable *by URL*, so the adapter embeds a minimal in-memory HTTP file host
//! (`TempFileHost`) that the server container fetches from. Point
//! `DsConfig.public_host` at an address routable from the DS container
//! (e.g. the harness machine's docker-bridge IP).
//!
//! Licensing note: this adapter *talks to* Document Server and records its
//! output; it never links AGPL sdkjs code into shipped binaries. Recording
//! output geometry as test fixtures is fine; redistributing DS itself is the
//! container image's business.

use std::collections::HashMap;
use std::net::{SocketAddr, TcpListener};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::adapters::pdfgeom::PdfGeometrySource;
use crate::engine::RenderEngine;
use crate::model::{ConformanceError, NormalizedRender, RenderMetadata, RenderSpec};

/// Connection settings for a Document Server instance.
#[derive(Debug, Clone)]
pub struct DsConfig {
    /// e.g. `http://127.0.0.1:9980` (trailing slash tolerated).
    pub base_url: String,
    /// JWT secret (`JWT_ENABLED=true` in the official image). `None` disables auth.
    pub jwt_secret: Option<String>,
    /// Address the DS container uses to fetch documents from us.
    /// Defaults to `127.0.0.1` (same-host containers must use the bridge IP!).
    pub public_host: String,
    /// Conversion endpoint path. Default `/converter` (7.x); older builds use
    /// `/ConvertService.ashx`.
    pub endpoint_path: String,
    pub poll_interval: Duration,
    pub timeout: Duration,
}

impl DsConfig {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            jwt_secret: None,
            public_host: "127.0.0.1".into(),
            endpoint_path: "/converter".into(),
            poll_interval: Duration::from_millis(500),
            timeout: Duration::from_secs(120),
        }
    }
}

/// Harness-grade in-memory document store shared with the serve thread.
type FileStore = Arc<Mutex<HashMap<String, (Vec<u8>, String)>>>;

/// Minimal in-memory HTTP host so Document Server can fetch input documents.
///
/// Serves `http://{public_host}:{port}/{key}` from a `HashMap` on a background
/// thread. Harness-grade only: HTTP/1.0 semantics, `Connection: close`.
pub struct TempFileHost {
    store: FileStore,
    url_base: String,
}

impl TempFileHost {
    pub fn start(public_host: &str) -> Result<Self, ConformanceError> {
        let listener = TcpListener::bind("0.0.0.0:0").map_err(ConformanceError::InputIo)?;
        let addr: SocketAddr = listener.local_addr().map_err(ConformanceError::InputIo)?;
        let store: FileStore = Arc::default();
        let server_store = Arc::clone(&store);
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let store = Arc::clone(&server_store);
                std::thread::spawn(move || serve(stream, store));
            }
        });
        Ok(Self {
            store,
            url_base: format!("http://{public_host}:{}", addr.port()),
        })
    }

    pub fn put(&self, key: &str, bytes: Vec<u8>, content_type: &str) {
        self.store
            .lock()
            .expect("file host poisoned")
            .insert(key.to_string(), (bytes, content_type.to_string()));
    }

    fn url(&self, key: &str) -> String {
        format!("{}/{}", self.url_base, key)
    }
}

fn serve(mut stream: std::net::TcpStream, store: FileStore) {
    use std::io::{Read, Write};
    let mut buf = [0u8; 4096];
    let mut request = Vec::new();
    // Read until end of headers; we only need the request line.
    loop {
        let n = match stream.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        request.extend_from_slice(&buf[..n]);
        if request.windows(4).any(|w| w == b"\r\n\r\n") || request.len() > 64 * 1024 {
            break;
        }
    }
    let line = String::from_utf8_lossy(&request);
    let key = line
        .split_whitespace()
        .nth(1)
        .and_then(|path| path.trim_start_matches('/').split('?').next())
        .unwrap_or("");
    let response = store
        .lock()
        .expect("file host poisoned")
        .get(key)
        .map(|(bytes, ct)| {
            (
                format!(
                    "HTTP/1.0 200 OK\r\nContent-Type: {ct}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    bytes.len()
                )
                .into_bytes(),
                bytes.clone(),
            )
        })
        .unwrap_or_else(|| {
            (
                b"HTTP/1.0 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    .to_vec(),
                Vec::new(),
            )
        });
    let _ = stream.write_all(&response.0);
    let _ = stream.write_all(&response.1);
}

/// Client for the Document Server conversion API.
pub struct DsClient {
    http: reqwest::blocking::Client,
    cfg: DsConfig,
}

impl DsClient {
    pub fn new(cfg: DsConfig) -> Result<Self, ConformanceError> {
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| ConformanceError::RenderFailed(format!("http client: {e}")))?;
        Ok(Self { http, cfg })
    }

    fn key_for(&self, doc: &[u8]) -> String {
        let digest = Sha256::digest(doc);
        hex(&digest)[..20].to_string()
    }

    /// Convert `doc` (`filetype`, e.g. "docx") to `outputtype` (e.g. "pdf").
    pub fn convert(
        &self,
        host: &TempFileHost,
        doc: &[u8],
        filetype: &str,
        outputtype: &str,
        title: &str,
    ) -> Result<Vec<u8>, ConformanceError> {
        let key = self.key_for(doc);
        host.put(&key, doc.to_vec(), "application/octet-stream");
        let body = json!({
            "async": true,
            "filetype": filetype,
            "key": key,
            "outputtype": outputtype,
            "title": title,
            "url": host.url(&key),
        });
        let endpoint = format!(
            "{}/{}",
            self.cfg.base_url.trim_end_matches('/'),
            self.cfg.endpoint_path.trim_start_matches('/')
        );

        let deadline = SystemTime::now().duration_since(UNIX_EPOCH).unwrap() + self.cfg.timeout;
        loop {
            let mut req = self.http.post(&endpoint).json(&body);
            if let Some(secret) = &self.cfg.jwt_secret {
                req = req.bearer_auth(sign_jwt(&body, secret)?);
            }
            let resp: Value = req
                .send()
                .and_then(|r| r.error_for_status())
                .and_then(|r| r.json())
                .map_err(|e| {
                    ConformanceError::RenderFailed(format!("documentserver {endpoint}: {e}"))
                })?;

            if let Some(code) = resp.get("error").and_then(Value::as_i64) {
                return Err(ConformanceError::RenderFailed(format!(
                    "documentserver conversion error {code}: {}",
                    error_text(code)
                )));
            }
            if resp.get("endConvert").and_then(Value::as_bool) == Some(true) {
                let url = resp.get("fileUrl").and_then(Value::as_str).ok_or_else(|| {
                    ConformanceError::RenderFailed("endConvert without fileUrl".into())
                })?;
                return self
                    .http
                    .get(url)
                    .send()
                    .and_then(|r| r.error_for_status())
                    .and_then(|r| r.bytes().map(|b| b.to_vec()))
                    .map_err(|e| {
                        ConformanceError::RenderFailed(format!("downloading result: {e}"))
                    });
            }
            if SystemTime::now().duration_since(UNIX_EPOCH).unwrap() > deadline {
                return Err(ConformanceError::RenderFailed(format!(
                    "documentserver conversion timed out after {}s: {resp}",
                    self.cfg.timeout.as_secs()
                )));
            }
            std::thread::sleep(self.cfg.poll_interval);
        }
    }
}

fn sign_jwt(payload: &Value, secret: &str) -> Result<String, ConformanceError> {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 300;
    let claims = json!({ "payload": payload, "exp": exp });
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| ConformanceError::RenderFailed(format!("jwt sign: {e}")))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn error_text(code: i64) -> &'static str {
    match code {
        -1 => "unknown error",
        -2 => "conversion timeout",
        -3 => "conversion error",
        -4 => "error while downloading the document file",
        -5 => "unsupported source file format",
        -6 => "access denied (document server could not fetch the input URL — check public_host)",
        -8 => "invalid token (JWT secret mismatch?)",
        -9 => "token not provided (JWT enabled but no secret configured)",
        _ => "see ONLYOFFICE conversion API docs",
    }
}

/// [`RenderEngine`] adapter: convert via Document Server, project the PDF.
pub struct OnlyOfficePdfEngine {
    client: DsClient,
    host: Arc<TempFileHost>,
    source: Box<dyn PdfGeometrySource>,
    /// Document Server version string (surfaced in reports).
    pub version: String,
    /// Source format of input documents ("docx", "odt", ...).
    pub filetype: String,
}

impl OnlyOfficePdfEngine {
    pub fn new(
        cfg: DsConfig,
        source: Box<dyn PdfGeometrySource>,
        version: impl Into<String>,
    ) -> Result<Self, ConformanceError> {
        let host = TempFileHost::start(&cfg.public_host)?;
        Ok(Self {
            client: DsClient::new(cfg)?,
            host: Arc::new(host),
            source,
            version: version.into(),
            filetype: "docx".into(),
        })
    }
}

impl RenderEngine for OnlyOfficePdfEngine {
    fn name(&self) -> &str {
        "onlyoffice-documentserver"
    }

    fn version(&self) -> &str {
        &self.version
    }

    fn render(&self, doc: &[u8], _spec: &RenderSpec) -> Result<NormalizedRender, ConformanceError> {
        let pdf = self
            .client
            .convert(&self.host, doc, &self.filetype, "pdf", "document.docx")?;
        let mut render = self.source.extract(&pdf)?;
        render.metadata = RenderMetadata {
            engine: self.name().to_string(),
            engine_version: self.version.clone(),
            captured_at: chrono::Utc::now().to_rfc3339(),
            environment: format!(
                "onlyoffice-ds pdf-export projection; filetype={}",
                self.filetype
            ),
        };
        Ok(render)
    }
}
