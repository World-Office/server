// WOPI client — calls the OCIS WOPI host and validates JWT tokens.

use anyhow::Result;
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

/// WOPI client that proxies requests to the upstream WOPI host (OCIS).
#[derive(Debug, Clone)]
pub struct WopiClient {
    http: Client,
    wopi_host_url: String,
}

impl WopiClient {
    /// Create a new WOPI client targeting the given host URL.
    pub fn new(wopi_host_url: String) -> Self {
        Self {
            http: Client::new(),
            wopi_host_url,
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
        let resp = self.http.get(&url).send().await?;
        let body: serde_json::Value = resp.error_for_status()?.json().await?;
        Ok(body)
    }

    /// GET file contents from the WOPI host.
    pub async fn get_file(&self, file_id: &str, access_token: &str) -> Result<Vec<u8>> {
        let url = format!(
            "{}/wopi/files/{}/contents?access_token={}",
            self.wopi_host_url, file_id, access_token
        );
        let resp = self.http.get(&url).send().await?;
        let bytes = resp.error_for_status()?.bytes().await?;
        Ok(bytes.to_vec())
    }

    /// PUT file contents to the WOPI host.
    pub async fn put_file(&self, file_id: &str, access_token: &str, data: Vec<u8>) -> Result<()> {
        let url = format!(
            "{}/wopi/files/{}/contents?access_token={}",
            self.wopi_host_url, file_id, access_token
        );
        self.http
            .post(&url)
            .header("Content-Type", "application/octet-stream")
            .body(data)
            .send()
            .await?
            .error_for_status()?;
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
    /// Lists all supported WOPI actions and URL templates. In production this
    /// would proxy to the WOPI host; for E2E testing, returns a static stub.
    const WOPI_DISCOVERY_XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<wopi-discovery>
  <net-zone name="external-http">
    <app name="World Office Document Server" href="http://localhost:8080">
      <action name="edit" ext="docx" urlsrc="http://localhost:8080/hosting/wopi/word/edit"/>
      <action name="edit" ext="xlsx" urlsrc="http://localhost:8080/hosting/wopi/sheet/edit"/>
      <action name="edit" ext="pptx" urlsrc="http://localhost:8080/hosting/wopi/slide/edit"/>
      <action name="edit" ext="vsdx" urlsrc="http://localhost:8080/hosting/wopi/diagram/edit"/>
      <action name="view" ext="vssx" urlsrc="http://localhost:8080/hosting/wopi/diagram/view"/>
      <action name="view" ext="vstx" urlsrc="http://localhost:8080/hosting/wopi/diagram/view"/>
      <action name="view" ext="vsdm" urlsrc="http://localhost:8080/hosting/wopi/diagram/view"/>
      <action name="view" ext="vssm" urlsrc="http://localhost:8080/hosting/wopi/diagram/view"/>
      <action name="view" ext="vstm" urlsrc="http://localhost:8080/hosting/wopi/diagram/view"/>
    </app>
  </net-zone>
</wopi-discovery>
"#;

    pub async fn get_discovery(&self) -> Result<String> {
        Ok(Self::WOPI_DISCOVERY_XML.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
