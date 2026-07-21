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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject — typically the user or file identifier.
    pub sub: String,
    /// Expiration time (Unix timestamp).
    pub exp: usize,
    /// Issued-at time (Unix timestamp).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iat: Option<usize>,
    /// User ID accessing the resource.
    #[serde(skip_serializing_if = "Option::is_none")]
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
            let body: serde_json::Value = resp.error_for_status()?.json().await?;
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
            let bytes = resp.error_for_status()?.bytes().await?;
            Ok(bytes.to_vec())
        })
        .await
        .context("get_file")
    }

    /// PUT file contents to the WOPI host.
    pub async fn put_file(&self, file_id: &str, access_token: &str, data: Vec<u8>) -> Result<()> {
        let url = format!(
            "{}/wopi/files/{}/contents?access_token={}",
            self.wopi_host_url, file_id, access_token
        );
        let http = self.http.clone();
        retry_with_backoff(|| async {
            http.post(&url)
                .header("Content-Type", "application/octet-stream")
                .body(data.clone())
                .send()
                .await?
                .error_for_status()?;
            Ok(())
        })
        .await
        .context("put_file")
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
        // The WOPI spec requires the <WOPISrc> placeholder in urlsrc attributes.
        // In XML, '<' and '>' must be escaped as &lt; and &gt; inside attribute values.
        let xml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<wopi-discovery>
  <net-zone name="external-http">
    <app name="World Office Document Server" href="{base}">
      <!-- Word / Document -->
      <action name="edit" ext="docx" urlsrc="{base}/hosting/wopi/word/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="edit" ext="odt" urlsrc="{base}/hosting/wopi/word/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="edit" ext="fodt" urlsrc="{base}/hosting/wopi/word/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="ott" urlsrc="{base}/hosting/wopi/word/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="edit" ext="rtf" urlsrc="{base}/hosting/wopi/word/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <!-- Spreadsheet -->
      <action name="edit" ext="xlsx" urlsrc="{base}/hosting/wopi/sheet/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="edit" ext="ods" urlsrc="{base}/hosting/wopi/sheet/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="edit" ext="fods" urlsrc="{base}/hosting/wopi/sheet/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="ots" urlsrc="{base}/hosting/wopi/sheet/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <!-- Presentation -->
      <action name="edit" ext="pptx" urlsrc="{base}/hosting/wopi/slide/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="edit" ext="odp" urlsrc="{base}/hosting/wopi/slide/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="edit" ext="fodp" urlsrc="{base}/hosting/wopi/slide/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="otp" urlsrc="{base}/hosting/wopi/slide/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <!-- Diagram / Visio -->
      <action name="edit" ext="vsdx" urlsrc="{base}/hosting/wopi/diagram/edit?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="vssx" urlsrc="{base}/hosting/wopi/diagram/view?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="vstx" urlsrc="{base}/hosting/wopi/diagram/view?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="vsdm" urlsrc="{base}/hosting/wopi/diagram/view?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="vssm" urlsrc="{base}/hosting/wopi/diagram/view?WOPISrc=&lt;WOPISrc&gt;"/>
      <action name="view" ext="vstm" urlsrc="{base}/hosting/wopi/diagram/view?WOPISrc=&lt;WOPISrc&gt;"/>
      <!-- PDF -->
      <action name="view" ext="pdf" urlsrc="{base}/hosting/wopi/pdf/view?WOPISrc=&lt;WOPISrc&gt;"/>
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
        assert!(xml.contains(
            "urlsrc=\"https://editor.example.com/hosting/wopi/word/edit?WOPISrc=&lt;WOPISrc&gt;\""
        ));
        assert!(xml.contains(
            "urlsrc=\"https://editor.example.com/hosting/wopi/sheet/edit?WOPISrc=&lt;WOPISrc&gt;\""
        ));
        assert!(xml.contains(
            "urlsrc=\"https://editor.example.com/hosting/wopi/slide/edit?WOPISrc=&lt;WOPISrc&gt;\""
        ));
        assert!(xml.contains("urlsrc=\"https://editor.example.com/hosting/wopi/diagram/edit?WOPISrc=&lt;WOPISrc&gt;\""));
        assert!(xml.contains(
            "urlsrc=\"https://editor.example.com/hosting/wopi/pdf/view?WOPISrc=&lt;WOPISrc&gt;\""
        ));
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
