// WOPI client — calls the OCIS WOPI host and validates JWT tokens.
//
// Production hardening: timeouts, retry with exponential backoff,
// and discovery response caching.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// JWT claims carried in access tokens issued by OCIS.
///
/// OCIS-signed WOPI tokens have the shape:
/// `{ "WopiContext": { "AccessToken": "...", ... }, "exp": <unix_ts> }`
/// and do NOT include `sub`/`iat`/`user_id`. Because wo-docserver only
/// validates the signature and forwards the token verbatim to the WOPI
/// host, every field except `exp` is optional and defaults if absent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject — typically the user or file identifier.
    #[serde(default)]
    pub sub: String,
    /// Expiration time (Unix timestamp).
    pub exp: usize,
    /// Issued-at time (Unix timestamp).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub iat: Option<usize>,
    /// User ID accessing the resource.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub user_id: Option<String>,
}

/// Cached discovery XML with a fetch timestamp.
#[derive(Debug, Clone)]
struct CachedDiscovery {
    xml: String,
    fetched_at: Instant,
}

/// WOPI client that proxies requests to the upstream WOPI host (OCIS).
#[derive(Debug, Clone)]
pub struct WopiClient {
    http: Client,
    wopi_host_url: String,
    public_url: String,
    discovery_cache: std::sync::Arc<Mutex<Option<CachedDiscovery>>>,
}

/// Maximum number of retry attempts for transient WOPI host failures.
const MAX_RETRIES: u32 = 3;

/// Initial backoff duration (doubles each attempt).
const INITIAL_BACKOFF: Duration = Duration::from_millis(100);

/// Discovery XML cache TTL.
const DISCOVERY_CACHE_TTL: Duration = Duration::from_secs(60);

impl WopiClient {
    /// Create a new WOPI client targeting the given host URL.
    ///
    /// Configures connect timeout (5s) and total request timeout (30s)
    /// to prevent hung connections when OCIS is unreachable.
    pub fn new(wopi_host_url: String, public_url: String, insecure: bool) -> Self {
        let mut builder = Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(30));
        if insecure {
            builder = builder.danger_accept_invalid_certs(true);
        }
        let http = builder.build().expect("valid reqwest client config");
        Self {
            http,
            wopi_host_url,
            public_url,
            discovery_cache: std::sync::Arc::new(Mutex::new(None)),
        }
    }

    /// GET CheckFileInfo from the WOPI host.
    pub async fn check_file_info(
        &self,
        file_id: &str,
        access_token: &str,
    ) -> Result<serde_json::Value> {
        let url = format!(
            "{}/wopi/files/{}?access_token={}",
            self.wopi_host_url, file_id, access_token
        );
        let http = self.http.clone();
        retry_with_backoff(|| async {
            let resp = http.get(&url).send().await?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(anyhow::anyhow!(
                    "WOPI CheckFileInfo upstream {status}: {body}"
                ));
            }
            let body: serde_json::Value = resp.json().await?;
            Ok(body)
        })
        .await
        .context("check_file_info")
    }

    /// GET file contents from the WOPI host.
    pub async fn get_file(&self, file_id: &str, access_token: &str) -> Result<Vec<u8>> {
        let url = format!(
            "{}/wopi/files/{}/contents?access_token={}",
            self.wopi_host_url, file_id, access_token
        );
        let http = self.http.clone();
        retry_with_backoff(|| async {
            let resp = http.get(&url).send().await?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(anyhow::anyhow!("WOPI GetFile upstream {status}: {body}"));
            }
            // Detect HTML error pages returned with 200 status (some proxies do this)
            let content_type = resp
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            if content_type.contains("text/html") {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(anyhow::anyhow!(
                    "WOPI GetFile returned HTML instead of file content (status {status}, content-type: {content_type}): {body}"
                ));
            }
            let bytes = resp.bytes().await?;
            Ok(bytes.to_vec())
        })
        .await
        .context("get_file")
    }

    /// PUT file contents to the WOPI host.
    ///
    /// Implements the WOPI lock lifecycle around the upload:
    /// Lock → PutFile (with lock) → Unlock. The OpenCloud collaboration
    /// service rejects PutFile with "file must be locked first" unless the
    /// editing client holds the lock (contentconnector.go:256).
    pub async fn put_file(
        &self,
        file_id: &str,
        access_token: &str,
        data: Vec<u8>,
        wopi_override: Option<String>,
        wopi_lock: Option<String>,
        if_match: Option<String>,
    ) -> Result<()> {
        let base = format!("{}/wopi/files/{}", self.wopi_host_url, file_id);
        let contents_url = format!("{base}/contents?access_token={access_token}");
        let lock_url = format!("{base}?access_token={access_token}");
        // Stable per-proxy lock id: this docserver is the single WOPI client
        // proxying PutFile for all browser editors.
        let lock_id = "wo-docserver-lock".to_string();
        let http = self.http.clone();
        let _ = wopi_lock; // superseded by proxy-managed locking

        // ── 1. Acquire the lock (taking over a stale one if present) ──
        let acquire = |lid: String| {
            let http = http.clone();
            let url = lock_url.clone();
            async move {
                http.post(&url)
                    .header("X-WOPI-Override", "LOCK")
                    .header("X-WOPI-Lock", &lid)
                    .send()
                    .await
            }
        };
        match acquire(lock_id.clone()).await {
            Ok(resp) if resp.status().is_success() => {}
            // 409 Conflict: another holder owns the lock; its id comes back
            // in the X-WOPI-Lock response header. Take over, then re-lock.
            Ok(resp) if resp.status().as_u16() == 409 => {
                let existing = resp
                    .headers()
                    .get("x-wopi-lock")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                if let Some(existing) = existing {
                    let unlock = http
                        .post(&lock_url)
                        .header("X-WOPI-Override", "UNLOCK")
                        .header("X-WOPI-Lock", &existing)
                        .send()
                        .await
                        .context("WOPI unlock request")?;
                    if !unlock.status().is_success() {
                        anyhow::bail!("WOPI unlock of stale lock failed: {}", unlock.status());
                    }
                }
                let resp = acquire(lock_id.clone()).await.context("WOPI re-lock request")?;
                if !resp.status().is_success() {
                    anyhow::bail!("WOPI lock failed after takeover: {}", resp.status());
                }
            }
            Ok(resp) => anyhow::bail!("WOPI lock failed: {}", resp.status()),
            Err(err) => return Err(err).context("WOPI lock request"),
        }

        // ── 2. Upload contents while holding the lock ──
        let mut req = http
            .post(&contents_url)
            .header("Content-Type", "application/octet-stream")
            .header("X-WOPI-Lock", &lock_id);
        if let Some(ref val) = wopi_override {
            req = req.header("X-WOPI-Override", val);
        }
        if let Some(ref val) = if_match {
            req = req.header("If-Match", val);
        }
        let resp = req.body(data).send().await.context("WOPI PutFile upload")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            // Best-effort release so the next autosave starts clean.
            let _ = http
                .post(&lock_url)
                .header("X-WOPI-Override", "UNLOCK")
                .header("X-WOPI-Lock", &lock_id)
                .send()
                .await;
            anyhow::bail!("WOPI PutFile upstream {status}: {body}");
        }

        // ── 3. Release the lock (best-effort) ──
        let _ = http
            .post(&lock_url)
            .header("X-WOPI-Override", "UNLOCK")
            .header("X-WOPI-Lock", &lock_id)
            .send()
            .await;

        Ok(())
    }

    /// Validate a JWT access token using the shared secret.
    pub fn validate_token(token: &str, secret: &str) -> Result<Claims> {
        let key = DecodingKey::from_secret(secret.as_bytes());
        let data = decode::<Claims>(token, &key, &Validation::default())?;
        Ok(data.claims)
    }

    /// Encode a JWT token with the given claims and secret.
    pub fn encode_token(claims: &Claims, secret: &str) -> Result<String> {
        let key = EncodingKey::from_secret(secret.as_bytes());
        let token = encode(&Header::default(), claims, &key)?;
        Ok(token)
    }

    /// Returns WOPI discovery XML.
    ///
    /// Uses an in-memory cache with a 60-second TTL to avoid regenerating
    /// the XML on every request. The XML is built from the configured
    /// public URL — in production this should ideally proxy to the
    /// upstream WOPI host's real discovery endpoint.
    pub async fn get_discovery(&self) -> Result<String> {
        {
            let guard = self.discovery_cache.lock().unwrap();
            if let Some(cached) = guard.as_ref() {
                if cached.fetched_at.elapsed() < DISCOVERY_CACHE_TTL {
                    return Ok(cached.xml.clone());
                }
            }
        }

        let base = self.public_url.trim_end_matches('/');
        // Note: the urlsrc attributes intentionally do NOT include a WOPISrc query
        // parameter. OpenCloud's collaboration service (the WOPI app provider) fetches
        // this discovery XML, parses the urlsrc as a base URL, and appends WOPISrc
        // (plus optional lang/dchat params) itself via its addQueryToURL logic.
        // Including `?WOPISrc=<WOPISrc>` here would produce a malformed app_url with
        // a double WOPISrc parameter (`?WOPISrc=<WOPISrc>&WOPISrc=<actual>`).
        let xml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<wopi-discovery>
  <net-zone name="external-http">
    <app name="World Office Document Server" href="{base}">
      <!-- Word / Document -->
      <action name="edit" ext="docx" urlsrc="{base}/hosting/wopi/word/edit"/>
      <action name="edit" ext="odt" urlsrc="{base}/hosting/wopi/word/edit"/>
      <action name="edit" ext="fodt" urlsrc="{base}/hosting/wopi/word/edit"/>
      <action name="view" ext="ott" urlsrc="{base}/hosting/wopi/word/edit"/>
      <action name="edit" ext="rtf" urlsrc="{base}/hosting/wopi/word/edit"/>
      <!-- Spreadsheet -->
      <action name="edit" ext="xlsx" urlsrc="{base}/hosting/wopi/sheet/edit"/>
      <action name="edit" ext="ods" urlsrc="{base}/hosting/wopi/sheet/edit"/>
      <action name="edit" ext="fods" urlsrc="{base}/hosting/wopi/sheet/edit"/>
      <action name="view" ext="ots" urlsrc="{base}/hosting/wopi/sheet/edit"/>
      <!-- Presentation -->
      <action name="edit" ext="pptx" urlsrc="{base}/hosting/wopi/slide/edit"/>
      <action name="edit" ext="odp" urlsrc="{base}/hosting/wopi/slide/edit"/>
      <action name="edit" ext="fodp" urlsrc="{base}/hosting/wopi/slide/edit"/>
      <action name="view" ext="otp" urlsrc="{base}/hosting/wopi/slide/edit"/>
      <!-- Diagram / Visio -->
      <action name="edit" ext="vsdx" urlsrc="{base}/hosting/wopi/diagram/edit"/>
      <action name="view" ext="vssx" urlsrc="{base}/hosting/wopi/diagram/view"/>
      <action name="view" ext="vstx" urlsrc="{base}/hosting/wopi/diagram/view"/>
      <action name="view" ext="vsdm" urlsrc="{base}/hosting/wopi/diagram/view"/>
      <action name="view" ext="vssm" urlsrc="{base}/hosting/wopi/diagram/view"/>
      <action name="view" ext="vstm" urlsrc="{base}/hosting/wopi/diagram/view"/>
      <!-- PDF -->
      <action name="view" ext="pdf" urlsrc="{base}/hosting/wopi/pdf/view"/>
    </app>
  </net-zone>
</wopi-discovery>
"#
        );

        {
            let mut guard = self.discovery_cache.lock().unwrap();
            *guard = Some(CachedDiscovery {
                xml: xml.clone(),
                fetched_at: Instant::now(),
            });
        }

        Ok(xml)
    }
}

/// Retry a fallible async operation with exponential backoff.
///
/// Only retries on transport-level errors (connection refused, DNS failure,
/// TLS handshake failure, timeouts). HTTP 4xx/5xx responses are NOT retried
/// because those indicate application-level issues.
///
/// Backoff sequence: 100ms, 200ms, 400ms, 800ms, 1600ms (capped at 5s).
async fn retry_with_backoff<F, Fut, T>(f: F) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut attempt = 0u32;
    loop {
        match f().await {
            Ok(value) => return Ok(value),
            Err(err) => {
                if !is_transient_error(&err) {
                    return Err(err);
                }
                attempt += 1;
                if attempt > MAX_RETRIES {
                    return Err(
                        err.context(format!("WOPI host unreachable after {MAX_RETRIES} retries"))
                    );
                }
                let delay = INITIAL_BACKOFF
                    .checked_mul(2u32.pow(attempt - 1))
                    .unwrap_or(Duration::from_secs(5));
                tokio::time::sleep(delay).await;
            }
        }
    }
}

/// Returns true if the error looks like a transient transport failure.
fn is_transient_error(err: &anyhow::Error) -> bool {
    if let Some(reqwest_err) = err.downcast_ref::<reqwest::Error>() {
        return reqwest_err.is_connect() || reqwest_err.is_timeout() || reqwest_err.is_request();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_discovery_uses_configured_public_url() {
        let client = WopiClient::new(
            "http://ocis:9200".into(),
            "https://editor.example.com".into(),
            false,
        );
        let xml = client.get_discovery().await.unwrap();
        assert!(xml.contains("href=\"https://editor.example.com\""));
        // urlsrc must NOT include a WOPISrc query param — OpenCloud adds it itself
        assert!(xml.contains("urlsrc=\"https://editor.example.com/hosting/wopi/word/edit\""));
        assert!(xml.contains("urlsrc=\"https://editor.example.com/hosting/wopi/sheet/edit\""));
        assert!(xml.contains("urlsrc=\"https://editor.example.com/hosting/wopi/slide/edit\""));
        assert!(xml.contains("urlsrc=\"https://editor.example.com/hosting/wopi/diagram/edit\""));
        assert!(xml.contains("urlsrc=\"https://editor.example.com/hosting/wopi/pdf/view\""));
        assert!(
            !xml.contains("WOPISrc="),
            "discovery urlsrc must not contain WOPISrc"
        );
        assert!(!xml.contains("localhost:8080"));
    }

    #[tokio::test]
    async fn test_discovery_cache_returns_cached_value() {
        let client = WopiClient::new(
            "http://ocis:9200".into(),
            "https://editor.example.com".into(),
            false,
        );
        let first = client.get_discovery().await.unwrap();
        let second = client.get_discovery().await.unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn test_jwt_roundtrip() {
        let secret = "test-secret-key";
        let claims = Claims {
            sub: "user-42".into(),
            exp: chrono::Utc::now().timestamp() as usize + 3600,
            iat: Some(chrono::Utc::now().timestamp() as usize),
            user_id: Some("alice".into()),
        };

        let token = WopiClient::encode_token(&claims, secret).unwrap();
        let decoded = WopiClient::validate_token(&token, secret).unwrap();

        assert_eq!(decoded.sub, "user-42");
        assert_eq!(decoded.user_id.as_deref(), Some("alice"));
    }

    #[test]
    fn test_jwt_invalid_secret_rejected() {
        let claims = Claims {
            sub: "user-42".into(),
            exp: chrono::Utc::now().timestamp() as usize + 3600,
            iat: None,
            user_id: None,
        };

        let token = WopiClient::encode_token(&claims, "correct-secret").unwrap();
        let result = WopiClient::validate_token(&token, "wrong-secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_jwt_expired_token_rejected() {
        let claims = Claims {
            sub: "user-42".into(),
            exp: chrono::Utc::now().timestamp() as usize - 100,
            iat: None,
            user_id: None,
        };

        let token = WopiClient::encode_token(&claims, "secret").unwrap();
        let result = WopiClient::validate_token(&token, "secret");
        assert!(result.is_err());
    }
}

#[cfg(test)]
mod lock_tests {
    //! Unit tests for the proxy-managed lock lifecycle in [`WopiClient::put_file`].
    //!
    //! Spins up a mock WOPI host (raw TCP, tokio only) that records every
    //! request so the exact LOCK → PutFile → UNLOCK dance can be asserted.

    use super::WopiClient;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::Mutex;

    #[derive(Debug, Clone)]
    struct RecordedReq {
        path: String,
        wopi_override: Option<String>,
        wopi_lock: Option<String>,
        body_len: usize,
    }

    #[derive(Debug, Clone, Copy, PartialEq)]
    enum Script {
        /// LOCK 200 → PUT 200 → UNLOCK 200
        Happy,
        /// LOCK 409 (stale-lock) → UNLOCK(stale) 200 → LOCK 200 → PUT 200 → UNLOCK 200
        Takeover,
        /// LOCK 200 → PUT 500 → best-effort UNLOCK; put_file must error
        UploadFails,
        /// LOCK 500 → error, no PutFile may be attempted
        LockFails,
    }

    struct MockHost {
        url: String,
        log: Arc<Mutex<Vec<RecordedReq>>>,
    }

    async fn spawn_mock(script: Script) -> MockHost {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let log: Arc<Mutex<Vec<RecordedReq>>> = Arc::new(Mutex::new(Vec::new()));
        let log_task = log.clone();
        tokio::spawn(async move {
            loop {
                let (mut sock, _) = match listener.accept().await {
                    Ok(v) => v,
                    Err(_) => return,
                };
                let log_conn = log_task.clone();
                tokio::spawn(async move {
                    let mut buf = Vec::new();
                    // read until end of headers
                    let mut chunk = [0u8; 4096];
                    let header_end;
                    loop {
                        let n = match sock.read(&mut chunk).await {
                            Ok(0) => return,
                            Ok(n) => n,
                            Err(_) => return,
                        };
                        buf.extend_from_slice(&chunk[..n]);
                        if let Some(pos) = find_subsequence(&buf, b"\r\n\r\n") {
                            header_end = pos + 4;
                            break;
                        }
                    }
                    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
                    let mut lines = head.split("\r\n");
                    let request_line = lines.next().unwrap_or("");
                    let path = request_line.split_whitespace().nth(1).unwrap_or("").to_string();
                    let mut content_length = 0usize;
                    let mut wopi_override = None;
                    let mut wopi_lock = None;
                    for line in lines {
                        let (name, value) = match line.split_once(':') {
                            Some(v) => v,
                            None => continue,
                        };
                        let name = name.trim().to_ascii_lowercase();
                        let value = value.trim();
                        match name.as_str() {
                            "content-length" => content_length = value.parse().unwrap_or(0),
                            "x-wopi-override" => wopi_override = Some(value.to_string()),
                            "x-wopi-lock" => wopi_lock = Some(value.to_string()),
                            _ => {}
                        }
                    }
                    // read remaining body bytes
                    while buf.len() < header_end + content_length {
                        let n = match sock.read(&mut chunk).await {
                            Ok(0) => break,
                            Ok(n) => n,
                            Err(_) => break,
                        };
                        buf.extend_from_slice(&chunk[..n]);
                    }
                    let body_len = buf.len().saturating_sub(header_end).min(content_length);

                    // decide the response
                    let (status, extra) = if path.contains("/contents") {
                        log_conn.lock().await.push(RecordedReq {
                            path: path.clone(),
                            wopi_override: wopi_override.clone(),
                            wopi_lock: wopi_lock.clone(),
                            body_len,
                        });
                        let status = if script == Script::UploadFails { 500 } else { 200 };
                        (status, String::new())
                    } else {
                        let mut log_guard = log_conn.lock().await;
                        let n = log_guard.len() + 1;
                        log_guard.push(RecordedReq {
                            path: path.clone(),
                            wopi_override: wopi_override.clone(),
                            wopi_lock: wopi_lock.clone(),
                            body_len,
                        });
                        drop(log_guard);
                        if script == Script::Takeover && n == 1 {
                            (409, "x-wopi-lock: stale-lock\r\n".to_string())
                        } else if script == Script::LockFails {
                            (500, String::new())
                        } else {
                            (200, String::new())
                        }
                    };

                    let resp = format!(
                        "HTTP/1.1 {status} MOCK\r\ncontent-length: 2\r\n{extra}connection: close\r\n\r\nok"
                    );
                    let _ = sock.write_all(resp.as_bytes()).await;
                    let _ = sock.shutdown().await;
                });
            }
        });
        MockHost {
            url: format!("http://{addr}"),
            log,
        }
    }

    fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
        haystack.windows(needle.len()).position(|w| w == needle)
    }

    async fn recorded(log: &Arc<Mutex<Vec<RecordedReq>>>) -> Vec<RecordedReq> {
        log.lock().await.clone()
    }

    #[tokio::test]
    async fn put_file_lock_dance_happy_path() {
        let host = spawn_mock(Script::Happy).await;
        let client = WopiClient::new(host.url.clone(), "https://public.example".into(), false);
        client
            .put_file("doc1", "tok", b"payload".to_vec(), None, None, None)
            .await
            .expect("put_file must succeed");

        let reqs = recorded(&host.log).await;
        assert!(reqs.len() >= 3, "expected LOCK+PUT+UNLOCK, got {:?}", reqs);
        assert_eq!(reqs[0].wopi_override.as_deref(), Some("LOCK"));
        assert_eq!(reqs[0].wopi_lock.as_deref(), Some("wo-docserver-lock"));
        assert!(reqs[1].path.split('?').next().unwrap().ends_with("/contents"));
        assert_eq!(reqs[1].wopi_lock.as_deref(), Some("wo-docserver-lock"));
        assert_eq!(reqs[1].body_len, 7, "payload must be forwarded");
        let last = reqs.last().unwrap();
        assert_eq!(last.wopi_override.as_deref(), Some("UNLOCK"));
    }

    #[tokio::test]
    async fn put_file_takes_over_stale_lock_on_409() {
        let host = spawn_mock(Script::Takeover).await;
        let client = WopiClient::new(host.url.clone(), "https://public.example".into(), false);
        client
            .put_file("doc2", "tok", b"xyz".to_vec(), None, None, None)
            .await
            .expect("put_file must take over the stale lock and succeed");

        let reqs = recorded(&host.log).await;
        // 1: LOCK → 409; 2: UNLOCK with stale id; 3: re-LOCK; 4: PUT; 5: UNLOCK
        assert!(reqs.len() >= 5, "expected takeover dance, got {:?}", reqs);
        assert_eq!(reqs[1].wopi_override.as_deref(), Some("UNLOCK"));
        assert_eq!(reqs[1].wopi_lock.as_deref(), Some("stale-lock"), "must unlock the STALE lock id");
        assert_eq!(reqs[2].wopi_override.as_deref(), Some("LOCK"));
        assert_eq!(reqs[2].wopi_lock.as_deref(), Some("wo-docserver-lock"));
        assert!(reqs[3].path.split('?').next().unwrap().ends_with("/contents"));
    }

    #[tokio::test]
    async fn put_file_failed_upload_releases_lock() {
        let host = spawn_mock(Script::UploadFails).await;
        let client = WopiClient::new(host.url.clone(), "https://public.example".into(), false);
        let result = client
            .put_file("doc3", "tok", b"abc".to_vec(), None, None, None)
            .await;
        assert!(result.is_err(), "upload failure must surface as error");

        let reqs = recorded(&host.log).await;
        let last = reqs.last().unwrap();
        assert_eq!(
            last.wopi_override.as_deref(),
            Some("UNLOCK"),
            "lock must be released best-effort after failed upload"
        );
    }

    #[tokio::test]
    async fn put_file_lock_failure_blocks_upload() {
        let host = spawn_mock(Script::LockFails).await;
        let client = WopiClient::new(host.url.clone(), "https://public.example".into(), false);
        let result = client
            .put_file("doc4", "tok", b"abc".to_vec(), None, None, None)
            .await;
        assert!(result.is_err(), "lock failure must surface as error");

        let reqs = recorded(&host.log).await;
        assert!(
            reqs.iter().all(|r| !r.path.split('?').next().unwrap().ends_with("/contents")),
            "no PutFile attempt may be made when the lock cannot be acquired"
        );
    }
}
