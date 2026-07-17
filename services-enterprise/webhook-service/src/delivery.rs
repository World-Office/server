//! HTTP webhook delivery with HMAC-SHA256 signing and exponential backoff retry.

use crate::models::{EventPayload, Webhook};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::time::Duration;

type HmacSha256 = Hmac<Sha256>;

/// Compute an HMAC-SHA256 signature for a payload byte slice.
/// The resulting hex string is sent as the `X-Signature-256` header.
pub fn compute_signature(secret: &str, payload: &[u8]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload);
    let result = mac.finalize();
    let code_bytes = result.into_bytes();
    hex::encode(code_bytes)
}

/// Outcome of a single webhook delivery attempt.
#[derive(Debug)]
pub struct DeliveryResult {
    pub success: bool,
    pub status_code: Option<i32>,
    pub error: Option<String>,
}

/// Deliver an event payload to a webhook endpoint.
///
/// Makes an HTTP POST request with:
/// - `Content-Type: application/json`
/// - `X-Signature-256: <hmac-sha256 hex string>`
/// - `User-Agent: World-Office-Webhook-Service/1.0`
pub async fn deliver_webhook(webhook: &Webhook, payload: &EventPayload) -> DeliveryResult {
    let body = serde_json::to_string(payload).unwrap_or_default();
    let signature = compute_signature(&webhook.secret, body.as_bytes());

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(webhook.timeout_ms as u64))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return DeliveryResult {
                success: false,
                status_code: None,
                error: Some(format!("failed to build HTTP client: {}", e)),
            };
        }
    };

    match client
        .post(&webhook.url)
        .header("Content-Type", "application/json")
        .header("X-Signature-256", &signature)
        .header("User-Agent", "World-Office-Webhook-Service/1.0")
        .body(body)
        .send()
        .await
    {
        Ok(response) => {
            let status_code = response.status().as_u16() as i32;
            if response.status().is_success() {
                DeliveryResult {
                    success: true,
                    status_code: Some(status_code),
                    error: None,
                }
            } else {
                DeliveryResult {
                    success: false,
                    status_code: Some(status_code),
                    error: Some(format!("HTTP {}", status_code)),
                }
            }
        }
        Err(e) => DeliveryResult {
            success: false,
            status_code: None,
            error: Some(format!("request failed: {}", e)),
        },
    }
}

/// Calculate the delay before the next retry using exponential backoff.
///
/// Formula: `10s × 3^(attempt-1)`
/// - attempt 1 → 10s
/// - attempt 2 → 30s
/// - attempt 3 → 90s
/// - attempt 4 → 270s
///
/// Exponent is capped at 20 (`3^20 ≈ 3.5B`) to prevent `u64` overflow.
pub fn retry_delay(attempt: i32) -> Duration {
    let base_seconds: u64 = 10;
    let exp = if attempt <= 1 {
        0
    } else {
        (attempt - 1).min(20) as u32
    };
    let multiplier = 3u64.pow(exp);
    Duration::from_secs(base_seconds * multiplier)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_signature_produces_hex_string() {
        let sig = compute_signature("mysecret", b"hello world");
        assert_eq!(sig.len(), 64); // SHA-256 hex is 64 chars
        assert!(sig.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn compute_signature_deterministic() {
        let a = compute_signature("key", b"payload");
        let b = compute_signature("key", b"payload");
        assert_eq!(a, b);
    }

    #[test]
    fn compute_signature_changes_with_key() {
        let a = compute_signature("key1", b"payload");
        let b = compute_signature("key2", b"payload");
        assert_ne!(a, b);
    }

    #[test]
    fn compute_signature_empty_secret() {
        let sig = compute_signature("", b"test");
        assert_eq!(sig.len(), 64);
    }

    #[test]
    fn retry_delay_increases_exponentially() {
        assert_eq!(retry_delay(1).as_secs(), 10);
        assert_eq!(retry_delay(2).as_secs(), 30);
        assert_eq!(retry_delay(3).as_secs(), 90);
        assert_eq!(retry_delay(4).as_secs(), 270);
        assert_eq!(retry_delay(5).as_secs(), 810);
    }

    #[test]
    fn retry_delay_zero_or_one_both_produce_base_delay() {
            assert_eq!(retry_delay(0).as_secs(), 10);
        assert_eq!(retry_delay(1).as_secs(), 10);
    }

    #[test]
    fn retry_delay_caps_at_maximum_exponent() {
        let d = retry_delay(100);
        assert!(d.as_secs() > 0);
        assert_eq!(retry_delay(100).as_secs(), retry_delay(21).as_secs());
    }
}
