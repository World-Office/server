//! Session & document-lifecycle exports for the OO→WO wasm boundary
//! (PORT-PLAN R2 / ORM-01 `collab` + `document` core rows).
//!
//! OO keeps connection state on the `asc_docs_api` JS instance (docId,
//! token, server version, changes URL) and the user identity in an
//! `asc_CUserInfo`. WO keeps it here, in one process-global session store —
//! one wasm module == one editor instance, exactly like one OO api object —
//! and serves it through OO-named exports (`#[wasm_bindgen(js_name)]`
//! aliases only, per D4; Rust stays snake_case):
//!
//! | OO row (ORM-01)                  | export                                  |
//! |----------------------------------|-----------------------------------------|
//! | `asc_setDocId` / `asc_setToken` / `asc_setServerVersion` / `asc_setUrlChanges` | `set_doc_id` / `set_token` / `set_server_version` / `set_url_changes` (+ `asc_get*` pull getters) |
//! | `asc_SetUserId` / `asc_putUserId`, `asc_SetUserName` / `asc_putUserName`, `asc_SetUserColor` | `set_user_id` / `set_user_name` / `set_user_color` |
//! | `asc_getUserId` / `asc_getUserName` | `get_user_id` / `get_user_name`      |
//! | `asc_CUserInfo` (data-class ctor) | `WasmUserInfo` blob via `set_user_info` / `get_user_info` |
//! | `asc_isSupportFeature`           | `is_support_feature` (static capability table) |
//! | `asc_getTitle` / `asc_getCreator` / `asc_getSubject` / … | `WasmDocInfo` blob via `get_doc_info` + the per-field getters, read from the parsed model's `CoreProperties` |
//! | `asc_coAuthoringDisconnect`      | `asc_co_authoring_disconnect` — flips the session to disconnected *and* pushes the `WsEvent::CoAuthoringDisconnect` frame (ORM-01 row 12) |
//!
//! The event-only `coAuthoringDisconnect` export lives in [`crate::events`];
//! the OO-named session one here is the lifecycle-aware entry point the UI
//! should call (D4 alias over the same push channel).
//!
//! Session state is per editor instance, not per document handle, so
//! `release_document` does not touch it; `reset_session` restores the
//! pristine state (OO `asc_docs_api` re-construction, editor re-init).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::events::{push, WsEvent};

// ── Wire types (D2: serde blobs, camelCase = OO wire schema) ─────────

/// OO `asc_CUserInfo` — the editor's user identity blob (ORM-03 collab row).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmUserInfo {
    /// User id as announced by the collaboration server ("" when local-only).
    pub id: String,
    /// Display name ("" when unset).
    pub username: String,
    pub firstname: Option<String>,
    pub lastname: Option<String>,
    /// Presence color, `"rrggbb"` hex or `"#rrggbb"` (OO ships an
    /// `{r,g,b,a}` object; WO serves the hex form the UI already uses).
    pub color: Option<String>,
}

/// Document-info blob: the parsed model's `docProps/core.xml` properties
/// (OO serves these as ~20 individual `asc_get*` engine-query rows; D2
/// consolidates them into one blob plus per-field getters for the named
/// rows).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmDocInfo {
    pub title: Option<String>,
    pub subject: Option<String>,
    pub creator: Option<String>,
    pub keywords: Option<String>,
    pub description: Option<String>,
    pub language: Option<String>,
    pub last_modified_by: Option<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
    pub category: Option<String>,
    pub revision: Option<String>,
}

impl WasmDocInfo {
    fn from_core(props: &wo_ooxml::model::CoreProperties) -> Self {
        WasmDocInfo {
            title: props.title.clone(),
            subject: props.subject.clone(),
            creator: props.creator.clone(),
            keywords: props.keywords.clone(),
            description: props.description.clone(),
            language: props.language.clone(),
            last_modified_by: props.last_modified_by.clone(),
            created: props.created.clone(),
            modified: props.modified.clone(),
            category: props.category.clone(),
            revision: props.revision.clone(),
        }
    }
}

// ── Session store (one wasm module == one editor instance) ───────────

#[derive(Debug, Clone)]
struct SessionState {
    doc_id: Option<String>,
    token: Option<String>,
    server_version: Option<String>,
    url_changes: Option<String>,
    user: WasmUserInfo,
    /// `false` after `asc_coAuthoringDisconnect` until `reset_session`.
    connected: bool,
}

impl Default for SessionState {
    fn default() -> Self {
        SessionState {
            doc_id: None,
            token: None,
            server_version: None,
            url_changes: None,
            user: WasmUserInfo::default(),
            connected: true,
        }
    }
}

static SESSION: OnceLock<Mutex<SessionState>> = OnceLock::new();

fn session() -> &'static Mutex<SessionState> {
    SESSION.get_or_init(|| Mutex::new(SessionState::default()))
}

/// Native-`cargo test`-only serialization: session tests mutate one global
/// store, so they hold this while running (tests run in parallel threads).
#[cfg(test)]
static SESSION_TEST_LOCK: Mutex<()> = Mutex::new(());

#[cfg(test)]
pub(crate) fn session_test_lock() -> std::sync::MutexGuard<'static, ()> {
    match SESSION_TEST_LOCK.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    }
}

// ── Session/connection fields (collab engine-mutation rows) ──────────

/// OO `asc_setDocId` — the collaboration server's document id.
#[wasm_bindgen(js_name = asc_setDocId)]
pub fn set_doc_id(doc_id: &str) {
    session().lock().unwrap().doc_id = Some(doc_id.to_string());
}

/// Pull getter for the session doc id (`None`/`null` until set).
#[wasm_bindgen(js_name = getDocId)]
pub fn get_doc_id() -> Option<String> {
    session().lock().unwrap().doc_id.clone()
}

/// OO `asc_setToken` — the collaboration JWT.
#[wasm_bindgen(js_name = asc_setToken)]
pub fn set_token(token: &str) {
    session().lock().unwrap().token = Some(token.to_string());
}

/// Pull getter for the session token.
#[wasm_bindgen(js_name = getToken)]
pub fn get_token() -> Option<String> {
    session().lock().unwrap().token.clone()
}

/// OO `asc_setServerVersion` — the collaboration server's build/version.
#[wasm_bindgen(js_name = asc_setServerVersion)]
pub fn set_server_version(version: &str) {
    session().lock().unwrap().server_version = Some(version.to_string());
}

/// Pull getter for the server version.
#[wasm_bindgen(js_name = getServerVersion)]
pub fn get_server_version() -> Option<String> {
    session().lock().unwrap().server_version.clone()
}

/// OO `asc_setUrlChanges` — the changes-stream URL for co-editing.
#[wasm_bindgen(js_name = asc_setUrlChanges)]
pub fn set_url_changes(url: &str) {
    session().lock().unwrap().url_changes = Some(url.to_string());
}

/// Pull getter for the changes URL.
#[wasm_bindgen(js_name = getUrlChanges)]
pub fn get_url_changes() -> Option<String> {
    session().lock().unwrap().url_changes.clone()
}

// ── User identity (asc_CUserInfo blob + asc_getUserName/getUserId) ───

/// OO `asc_SetUserId` / `asc_putUserId` (two SDK spellings of the same
/// setter — both aliases land here).
#[wasm_bindgen(js_name = asc_SetUserId)]
pub fn set_user_id(user_id: &str) {
    session().lock().unwrap().user.id = user_id.to_string();
}

/// OO `asc_putUserId` — UI-facing alias of `asc_SetUserId`.
#[wasm_bindgen(js_name = asc_putUserId)]
pub fn put_user_id(user_id: &str) {
    set_user_id(user_id);
}

/// OO `asc_SetUserName` / `asc_putUserName`.
#[wasm_bindgen(js_name = asc_SetUserName)]
pub fn set_user_name(user_name: &str) {
    session().lock().unwrap().user.username = user_name.to_string();
}

/// OO `asc_putUserName` — UI-facing alias of `asc_SetUserName`.
#[wasm_bindgen(js_name = asc_putUserName)]
pub fn put_user_name(user_name: &str) {
    set_user_name(user_name);
}

/// OO `asc_SetUserColor` — presence color for foreign carets/chips.
#[wasm_bindgen(js_name = asc_SetUserColor)]
pub fn set_user_color(color: &str) {
    session().lock().unwrap().user.color = Some(color.to_string());
}

/// OO `asc_getUserId` — the current user id (`""` before any setter ran).
#[wasm_bindgen(js_name = asc_getUserId)]
pub fn get_user_id() -> String {
    session().lock().unwrap().user.id.clone()
}

/// OO `asc_getUserName` — the current display name (`""` before any
/// setter ran; OO returns `''` in the same situation).
#[wasm_bindgen(js_name = asc_getUserName)]
pub fn get_user_name() -> String {
    session().lock().unwrap().user.username.clone()
}

/// Install the whole identity blob at once (the WO name of OO's
/// `asc_CUserInfo` constructor + `sendCommand` handshake). Accepts the
/// camelCase `WasmUserInfo` schema; returns the canonical blob.
#[wasm_bindgen(js_name = setUserInfo)]
pub fn set_user_info(json: &str) -> Result<String, String> {
    let user: WasmUserInfo =
        serde_json::from_str(json).map_err(|e| format!("Invalid user info JSON: {e}"))?;
    *session().lock().unwrap() = SessionState {
        user: user.clone(),
        ..SessionState::default()
    };
    serde_json::to_string(&user).map_err(|e| format!("JSON error: {e}"))
}

/// Read back the identity blob (canonical `WasmUserInfo` JSON).
#[wasm_bindgen(js_name = getUserInfo)]
pub fn get_user_info() -> Result<String, String> {
    serde_json::to_string(&session().lock().unwrap().user).map_err(|e| format!("JSON error: {e}"))
}

// ── Feature support (asc_isSupportFeature, Main's 1 call site) ───────

/// Capabilities the WO engine can honestly answer `true` for today. This
/// is the static half of OO's feature detection (`asc_isSupportFeature`
/// gates Main-controller affordances); features outside the table return
/// `false`, so new engine capabilities land here as they ship. Matching is
/// case-insensitive (OO's call sites pass mixed-case feature names).
const SUPPORTED_FEATURES: &[&str] = &[
    // insert_text/delete_selection + apply_structure_op over the typed model
    "support-text-editing",
    // set_property/get_property blobs + apply_formatting
    "support-text-formatting",
    // undo/redo snapshot stack
    "support-undo-redo",
    // spell_load_dictionary/spell_check_word/spell_suggest
    "support-spellcheck",
    // spell_load_hyphenation/spell_hyphenate
    "support-hyphenation",
];

/// OO `asc_isSupportFeature` — feature detection for the UI shell.
#[wasm_bindgen(js_name = asc_isSupportFeature)]
pub fn is_support_feature(feature: &str) -> bool {
    SUPPORTED_FEATURES
        .iter()
        .any(|f| f.eq_ignore_ascii_case(feature))
}

// ── Document info (document engine-query rows) ───────────────────────

fn core_props(doc_handle: u32) -> Result<wo_ooxml::model::CoreProperties, String> {
    let store = super::DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    let doc = store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {doc_handle} not found"))?;
    Ok(doc.core_properties.clone())
}

/// Document-info blob for a parsed document (camelCase `WasmDocInfo`
/// schema; `null` fields for core properties the part does not carry).
#[wasm_bindgen(js_name = asc_getDocInfo)]
pub fn get_doc_info(doc_handle: u32) -> Result<String, String> {
    let info = WasmDocInfo::from_core(&core_props(doc_handle)?);
    serde_json::to_string(&info).map_err(|e| format!("JSON error: {e}"))
}

fn doc_info_field(
    doc_handle: u32,
    pick: fn(&WasmDocInfo) -> &Option<String>,
) -> Result<String, String> {
    let info = WasmDocInfo::from_core(&core_props(doc_handle)?);
    Ok(pick(&info).clone().unwrap_or_default())
}

/// OO `asc_getTitle`.
#[wasm_bindgen(js_name = asc_getTitle)]
pub fn get_title(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.title)
}

/// OO `asc_getSubject`.
#[wasm_bindgen(js_name = asc_getSubject)]
pub fn get_subject(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.subject)
}

/// OO `asc_getCreator` (docProps `dc:creator`).
#[wasm_bindgen(js_name = asc_getCreator)]
pub fn get_creator(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.creator)
}

/// OO `asc_getKeywords`.
#[wasm_bindgen(js_name = asc_getKeywords)]
pub fn get_keywords(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.keywords)
}

/// OO `asc_getDescription`.
#[wasm_bindgen(js_name = asc_getDescription)]
pub fn get_description(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.description)
}

/// OO `asc_getLanguage`.
#[wasm_bindgen(js_name = asc_getLanguage)]
pub fn get_language(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.language)
}

/// OO `asc_getLastModifiedBy` (docProps `cp:lastModifiedBy`).
#[wasm_bindgen(js_name = asc_getLastModifiedBy)]
pub fn get_last_modified_by(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.last_modified_by)
}

/// OO `asc_getCreated` (docProps `dcterms:created`).
#[wasm_bindgen(js_name = asc_getCreated)]
pub fn get_created(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.created)
}

/// OO `asc_getModified` (docProps `dcterms:modified`).
#[wasm_bindgen(js_name = asc_getModified)]
pub fn get_modified(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.modified)
}

/// OO `asc_getCategory`.
#[wasm_bindgen(js_name = asc_getCategory)]
pub fn get_category(doc_handle: u32) -> Result<String, String> {
    doc_info_field(doc_handle, |i| &i.category)
}

// ── Lifecycle: disconnect + reset ────────────────────────────────────

/// OO `asc_coAuthoringDisconnect` (ORM-01 row 12): the app drops the
/// co-editing session. Marks the session disconnected and pushes the
/// `WsEvent::CoAuthoringDisconnect` frame the UI banner listens for —
/// the lifecycle-aware sibling of `events::coAuthoringDisconnect`.
#[wasm_bindgen(js_name = asc_coAuthoringDisconnect)]
pub fn asc_co_authoring_disconnect(reason: &str) {
    session().lock().unwrap().connected = false;
    let _ = push(WsEvent::CoAuthoringDisconnect {
        reason: reason.to_string(),
    });
}

/// Pull getter: is the session still connected? (`false` between
/// `asc_coAuthoringDisconnect` and the next `reset_session`.)
#[wasm_bindgen(js_name = sessionIsConnected)]
pub fn session_is_connected() -> bool {
    session().lock().unwrap().connected
}

/// Reset the session to the pristine state (OO re-`asc_docs_api` on editor
/// re-init): connection fields, identity, and the connected flag.
#[wasm_bindgen(js_name = resetSession)]
pub fn reset_session() {
    *session().lock().unwrap() = SessionState::default();
}

/// Drop session state for tests (same reset, no wasm export alias).
#[cfg(test)]
pub(crate) fn reset_session_for_test() {
    reset_session();
}
