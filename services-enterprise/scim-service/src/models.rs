//! SCIM 2.0 protocol models for User and Group resources.
//!
//! Implements the core schemas defined in RFC 7643:
//! - `urn:ietf:params:scim:schemas:core:2.0:User`
//! - `urn:ietf:params:scim:schemas:core:2.0:Group`
//! - `urn:ietf:params:scim:api:messages:2.0:ListResponse`
//! - `urn:ietf:params:scim:api:messages:2.0:Error`

use serde::{Deserialize, Serialize};

pub const SCHEMA_USER: &str = "urn:ietf:params:scim:schemas:core:2.0:User";
pub const SCHEMA_GROUP: &str = "urn:ietf:params:scim:schemas:core:2.0:Group";
pub const SCHEMA_LIST_RESPONSE: &str = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
pub const SCHEMA_ERROR: &str = "urn:ietf:params:scim:api:messages:2.0:Error";

/// SCIM resource metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimMeta {
    #[serde(rename = "resourceType")]
    pub resource_type: String,
    pub created: String,
    #[serde(rename = "lastModified")]
    pub last_modified: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// A multi-valued attribute entry (email, phone, etc.).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimMultiValue {
    pub value: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation: Option<String>,
    #[serde(rename = "$ref", skip_serializing_if = "Option::is_none")]
    pub ref_: Option<String>,
}

/// SCIM 2.0 User resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimUser {
    pub schemas: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "userName")]
    pub user_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<ScimUserName>,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emails: Option<Vec<ScimMultiValue>>,
    #[serde(rename = "phoneNumbers", skip_serializing_if = "Option::is_none")]
    pub phone_numbers: Option<Vec<ScimMultiValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ScimMeta>,
}

impl ScimUser {
    pub fn new(id: String, user_name: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            schemas: vec![SCHEMA_USER.to_string()],
            id: Some(id),
            user_name,
            name: None,
            display_name: None,
            active: Some(true),
            emails: None,
            phone_numbers: None,
            meta: Some(ScimMeta {
                resource_type: "User".to_string(),
                created: now.clone(),
                last_modified: now,
                location: None,
                version: None,
            }),
        }
    }
}

/// SCIM User name sub-attribute.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimUserName {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formatted: Option<String>,
    #[serde(rename = "givenName", skip_serializing_if = "Option::is_none")]
    pub given_name: Option<String>,
    #[serde(rename = "familyName", skip_serializing_if = "Option::is_none")]
    pub family_name: Option<String>,
}

/// SCIM 2.0 Group resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimGroup {
    pub schemas: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub members: Option<Vec<ScimMultiValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ScimMeta>,
}

impl ScimGroup {
    pub fn new(id: String, display_name: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            schemas: vec![SCHEMA_GROUP.to_string()],
            id: Some(id),
            display_name,
            members: None,
            meta: Some(ScimMeta {
                resource_type: "Group".to_string(),
                created: now.clone(),
                last_modified: now,
                location: None,
                version: None,
            }),
        }
    }
}

/// SCIM 2.0 list response wrapper.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct ScimListResponse {
    pub schemas: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub totalResults: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub itemsPerPage: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub startIndex: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub Resources: Option<Vec<serde_json::Value>>,
}

impl ScimListResponse {
    pub fn new(resources: Vec<serde_json::Value>, total: i64) -> Self {
        Self {
            schemas: vec![SCHEMA_LIST_RESPONSE.to_string()],
            totalResults: Some(total),
            itemsPerPage: Some(total.max(1)),
            startIndex: Some(1),
            Resources: Some(resources),
        }
    }
}

/// SCIM 2.0 error response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct ScimError {
    pub schemas: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scimType: Option<String>,
    pub detail: String,
    pub status: String,
}

impl ScimError {
    pub fn new(scim_type: Option<&str>, detail: &str, status: u16) -> Self {
        Self {
            schemas: vec![SCHEMA_ERROR.to_string()],
            scimType: scim_type.map(String::from),
            detail: detail.to_string(),
            status: status.to_string(),
        }
    }
}
