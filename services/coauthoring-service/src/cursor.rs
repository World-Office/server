//! coauthoring-service/src/cursor.rs — Cursor/selection sharing per-path
//!
//! Tracks where each user's cursor and selection is in the document tree.
//! Uses [`wo_common::Path`] addressing so cursor positions live in the same
//! coordinate system as mutation operations (`ModelOp`). When a user moves
//! their cursor or changes their selection, the server stores the state and
//! broadcasts [`CursorEvent`] messages to other participants so they can
//! render remote cursors in the editor UI.
//!
//! # Design
//!
//! - Each user has a `CursorState`: an **anchor** position (where the cursor
//!   starts) and an optional **focus** (the other end of a range selection).
//!   When `focus` is `None`, the cursor is collapsed (caret/insertion point).
//! - `CursorTracker` is the per-session registry mapping `user_id → CursorState`.
//! - [`CursorEvent`] is the wire message sent over WebSocket to broadcast
//!   cursor changes to other participants.
//!
//! # Wire format
//!
//! ```json
//! // CursorEvent (WebSocket broadcast)
//! {
//!   "user_id": "alice",
//!   "anchor": { "kind": "text", "para": 3, "run": 1, "char": 14 },
//!   "focus":   { "kind": "text", "para": 3, "run": 1, "char": 20 }
//! }
//! ```
//!
//! # Invariants
//!
//! - **INV-1:** `cursors` map contains at most one entry per `user_id`.
//! - **INV-2:** `anchor` and `focus` (when present) are valid [`wo_common::Path`] values.
//! - **INV-3:** `others_cursors(exclude)` never returns the excluded user.
//! - **INV-4:** `CursorState` is JSON-serializable over WebSocket (serde).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wo_common::{Path, Range};

// ---------------------------------------------------------------------------
// CursorState — one user's cursor/selection
// ---------------------------------------------------------------------------

/// Represents a user's cursor state in the document tree.
///
/// A cursor is either **collapsed** (caret / insertion point) or **expanded**
/// (range selection). When `focus` is `None`, the cursor is collapsed at
/// `anchor`. When `focus` is `Some`, the selection spans from `anchor` to
/// `focus`.
///
/// The `anchor` is the position where the cursor originated (e.g. where
/// the mouse was pressed). The `focus` is where it was released (for
/// selections) or the current position (for caret movement).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CursorState {
    /// Anchor position (start of cursor / selection origin).
    pub anchor: Path,

    /// Focus position (end of selection). `None` means the cursor is
    /// collapsed (caret/insertion point) at `anchor`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<Path>,
}

impl CursorState {
    /// Create a collapsed cursor (caret / insertion point) at a position.
    ///
    /// # Example
    ///
    /// ```
    /// use wo_common::Path;
    /// use coauthoring_service::cursor::CursorState;
    ///
    /// let caret = CursorState::caret(Path::Text { para: 0, run: 0, char: 5 });
    /// assert!(!caret.is_selection());
    /// ```
    pub fn caret(anchor: Path) -> Self {
        Self {
            anchor,
            focus: None,
        }
    }

    /// Create an expanded cursor (range selection) from anchor to focus.
    ///
    /// # Example
    ///
    /// ```
    /// use wo_common::Path;
    /// use coauthoring_service::cursor::CursorState;
    ///
    /// let sel = CursorState::selection(
    ///     Path::Text { para: 0, run: 0, char: 5 },
    ///     Path::Text { para: 0, run: 0, char: 10 },
    /// );
    /// assert!(sel.is_selection());
    /// ```
    pub fn selection(anchor: Path, focus: Path) -> Self {
        Self {
            anchor,
            focus: Some(focus),
        }
    }

    /// Whether the cursor has a range selection (vs collapsed caret).
    pub fn is_selection(&self) -> bool {
        self.focus.is_some()
    }

    /// Whether the cursor is collapsed (caret / insertion point).
    pub fn is_caret(&self) -> bool {
        self.focus.is_none()
    }

    /// Get the selection as a [`Range`], or `None` if collapsed.
    ///
    /// The range spans from `anchor` to `focus`. Callers should normalize
    /// (ensure `start <= end` in document order) if needed.
    pub fn range(&self) -> Option<Range> {
        self.focus
            .as_ref()
            .map(|f| Range::new(self.anchor.clone(), f.clone()))
    }

    /// Convert to a collapsed caret, discarding the selection.
    pub fn collapse_to_caret(self) -> Self {
        Self {
            anchor: self.anchor,
            focus: None,
        }
    }
}

// ---------------------------------------------------------------------------
// CursorTracker — per-session cursor registry
// ---------------------------------------------------------------------------

/// Tracks cursor/selection state for all users in a collaborative session.
///
/// Each collaborative document session has one `CursorTracker`. Clients send
/// [`CursorEvent`] messages when they move their cursor or change their
/// selection. The server updates the tracker and broadcasts changes to
/// other participants.
///
/// # Invariants
///
/// - **INV-1:** At most one entry per `user_id`.
/// - **INV-2:** `update_cursor` returns `true` only when the state actually changed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorTracker {
    /// Maps `user_id` → current cursor state.
    cursors: HashMap<String, CursorState>,
}

impl Default for CursorTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl CursorTracker {
    /// Create a new empty cursor tracker.
    pub fn new() -> Self {
        Self {
            cursors: HashMap::new(),
        }
    }

    /// Update a user's cursor state.
    ///
    /// If the cursor state is identical to the current state (same `anchor`
    /// and `focus`), returns `false` and does nothing. Otherwise stores the
    /// new state and returns `true`.
    ///
    /// # Example
    ///
    /// ```
    /// use wo_common::Path;
    /// use coauthoring_service::cursor::{CursorState, CursorTracker};
    ///
    /// let mut tracker = CursorTracker::new();
    /// let cursor = CursorState::caret(Path::Text { para: 0, run: 0, char: 5 });
    /// assert!(tracker.update_cursor("alice", cursor));
    /// assert!(!tracker.update_cursor("alice", CursorState::caret(Path::Text { para: 0, run: 0, char: 5 })));
    /// ```
    pub fn update_cursor(&mut self, user_id: &str, cursor: CursorState) -> bool {
        if let Some(existing) = self.cursors.get(user_id)
            && *existing == cursor
        {
            return false;
        }
        self.cursors.insert(user_id.to_string(), cursor);
        true
    }

    /// Remove a user's cursor (e.g. when they leave the session).
    ///
    /// Returns the previous cursor state if the user had one, `None` otherwise.
    pub fn remove_cursor(&mut self, user_id: &str) -> Option<CursorState> {
        self.cursors.remove(user_id)
    }

    /// Get a specific user's cursor state.
    pub fn get(&self, user_id: &str) -> Option<&CursorState> {
        self.cursors.get(user_id)
    }

    /// Get all cursor states except for a specific user.
    ///
    /// Used when broadcasting cursor updates: send all *other* users'
    /// cursors to the requesting user.
    ///
    /// INV-3: The excluded user never appears in the result.
    pub fn others_cursors(&self, exclude_user: &str) -> Vec<(&str, &CursorState)> {
        self.cursors
            .iter()
            .filter(|(uid, _)| *uid != exclude_user)
            .map(|(uid, cursor)| (uid.as_str(), cursor))
            .collect()
    }

    /// Get all cursor states as a reference to the internal map.
    pub fn all_cursors(&self) -> &HashMap<String, CursorState> {
        &self.cursors
    }

    /// Number of users with active cursors.
    pub fn cursor_count(&self) -> usize {
        self.cursors.len()
    }

    /// Check whether a user has an active cursor.
    pub fn has_cursor(&self, user_id: &str) -> bool {
        self.cursors.contains_key(user_id)
    }

    /// Get all user IDs with active cursors.
    pub fn user_ids(&self) -> Vec<&str> {
        self.cursors.keys().map(|s| s.as_str()).collect()
    }

    /// Clear all cursors. Used when a session is reset.
    pub fn clear(&mut self) {
        self.cursors.clear();
    }
}

// ---------------------------------------------------------------------------
// CursorEvent — wire message for cursor changes
// ---------------------------------------------------------------------------

/// Wire message broadcast over WebSocket when a user moves their cursor
/// or changes their selection.
///
/// Sent as JSON from the server to all *other* participants in the session.
///
/// # Wire format
///
/// ```json
/// {
///   "user_id": "alice",
///   "anchor": { "kind": "text", "para": 3, "run": 1, "char": 14 },
///   "focus":   { "kind": "text", "para": 3, "run": 1, "char": 20 }
/// }
/// ```
///
/// When `focus` is absent, the cursor is collapsed:
///
/// ```json
/// {
///   "user_id": "alice",
///   "anchor": { "kind": "text", "para": 3, "run": 1, "char": 14 }
/// }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CursorEvent {
    /// User who owns this cursor.
    pub user_id: String,

    /// Anchor position.
    pub anchor: Path,

    /// Focus position (absent = collapsed caret).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<Path>,
}

impl CursorEvent {
    /// Create a cursor event from a user ID and cursor state.
    pub fn from_state(user_id: String, state: &CursorState) -> Self {
        Self {
            user_id,
            anchor: state.anchor.clone(),
            focus: state.focus.clone(),
        }
    }

    /// Create a collapsed caret event.
    pub fn caret(user_id: String, anchor: Path) -> Self {
        Self {
            user_id,
            anchor,
            focus: None,
        }
    }

    /// Create a selection event.
    pub fn selection(user_id: String, anchor: Path, focus: Path) -> Self {
        Self {
            user_id,
            anchor,
            focus: Some(focus),
        }
    }

    /// Convert to a `CursorState`.
    pub fn to_cursor_state(&self) -> CursorState {
        CursorState {
            anchor: self.anchor.clone(),
            focus: self.focus.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wo_common::Path;

    // --- Helpers -------------------------------------------------------------

    fn text_path(para: usize, run: usize, char: usize) -> Path {
        Path::Text { para, run, char }
    }

    fn table_path(
        table: usize,
        row: usize,
        cell: usize,
        para: usize,
        run: usize,
        char: usize,
    ) -> Path {
        Path::Table {
            table,
            row,
            cell,
            para,
            run,
            char,
        }
    }

    fn sheet_path(sheet: &str, row: u32, col: u32) -> Path {
        Path::Sheet {
            sheet: sheet.to_string(),
            row,
            col,
        }
    }

    // =========================================================================
    // 1. CursorState — construction
    // =========================================================================

    #[test]
    fn caret_is_collapsed() {
        let cursor = CursorState::caret(text_path(0, 0, 5));
        assert!(cursor.is_caret());
        assert!(!cursor.is_selection());
        assert!(cursor.focus.is_none());
    }

    #[test]
    fn selection_is_expanded() {
        let cursor = CursorState::selection(text_path(0, 0, 5), text_path(0, 0, 10));
        assert!(cursor.is_selection());
        assert!(!cursor.is_caret());
    }

    #[test]
    fn caret_anchor_correct() {
        let cursor = CursorState::caret(text_path(3, 1, 14));
        assert_eq!(cursor.anchor, text_path(3, 1, 14));
    }

    #[test]
    fn selection_anchor_and_focus_correct() {
        let cursor = CursorState::selection(text_path(1, 0, 0), text_path(1, 0, 20));
        assert_eq!(cursor.anchor, text_path(1, 0, 0));
        assert_eq!(cursor.focus, Some(text_path(1, 0, 20)));
    }

    // =========================================================================
    // 2. CursorState — range
    // =========================================================================

    #[test]
    fn caret_has_no_range() {
        let cursor = CursorState::caret(text_path(0, 0, 0));
        assert!(cursor.range().is_none());
    }

    #[test]
    fn selection_has_range() {
        let cursor = CursorState::selection(text_path(0, 0, 2), text_path(0, 0, 8));
        let range = cursor.range().unwrap();
        assert_eq!(range.start, text_path(0, 0, 2));
        assert_eq!(range.end, text_path(0, 0, 8));
    }

    // =========================================================================
    // 3. CursorState — collapse
    // =========================================================================

    #[test]
    fn collapse_to_caret_discards_focus() {
        let cursor = CursorState::selection(text_path(1, 0, 0), text_path(1, 0, 10));
        let collapsed = cursor.collapse_to_caret();
        assert!(collapsed.is_caret());
        assert_eq!(collapsed.anchor, text_path(1, 0, 0));
    }

    #[test]
    fn collapse_idempotent_on_caret() {
        let cursor = CursorState::caret(text_path(5, 0, 3));
        let collapsed = cursor.collapse_to_caret();
        assert!(collapsed.is_caret());
        assert_eq!(collapsed.anchor, text_path(5, 0, 3));
    }

    // =========================================================================
    // 4. CursorState — equality
    // =========================================================================

    #[test]
    fn caret_equality_same_position() {
        let a = CursorState::caret(text_path(1, 0, 5));
        let b = CursorState::caret(text_path(1, 0, 5));
        assert_eq!(a, b);
    }

    #[test]
    fn caret_inequality_different_position() {
        let a = CursorState::caret(text_path(1, 0, 5));
        let b = CursorState::caret(text_path(1, 0, 6));
        assert_ne!(a, b);
    }

    #[test]
    fn selection_equality_same_range() {
        let a = CursorState::selection(text_path(0, 0, 0), text_path(0, 0, 5));
        let b = CursorState::selection(text_path(0, 0, 0), text_path(0, 0, 5));
        assert_eq!(a, b);
    }

    #[test]
    fn caret_selection_inequality() {
        let caret = CursorState::caret(text_path(0, 0, 5));
        let sel = CursorState::selection(text_path(0, 0, 5), text_path(0, 0, 10));
        assert_ne!(caret, sel);
    }

    // =========================================================================
    // 5. CursorState — serde round-trip
    // =========================================================================

    #[test]
    fn caret_serde_roundtrip() {
        let cursor = CursorState::caret(text_path(3, 1, 14));
        let json = serde_json::to_string(&cursor).unwrap();
        let back: CursorState = serde_json::from_str(&json).unwrap();
        assert_eq!(cursor, back);
    }

    #[test]
    fn selection_serde_roundtrip() {
        let cursor = CursorState::selection(text_path(0, 0, 5), text_path(2, 0, 0));
        let json = serde_json::to_string(&cursor).unwrap();
        let back: CursorState = serde_json::from_str(&json).unwrap();
        assert_eq!(cursor, back);
    }

    #[test]
    fn caret_json_missing_focus_field() {
        // Verify that focus is omitted when None (skip_serializing_if)
        let cursor = CursorState::caret(text_path(0, 0, 5));
        let val = serde_json::to_value(&cursor).unwrap();
        assert!(val.get("focus").is_none());
        assert_eq!(val["anchor"]["kind"], "text");
    }

    #[test]
    fn selection_json_has_focus_field() {
        let cursor = CursorState::selection(text_path(0, 0, 0), text_path(0, 0, 5));
        let val = serde_json::to_value(&cursor).unwrap();
        assert!(val.get("focus").is_some());
    }

    // =========================================================================
    // 6. CursorState — table path
    // =========================================================================

    #[test]
    fn caret_table_path() {
        let cursor = CursorState::caret(table_path(0, 2, 1, 0, 0, 5));
        assert_eq!(cursor.anchor, table_path(0, 2, 1, 0, 0, 5));
        assert!(cursor.is_caret());
    }

    #[test]
    fn selection_table_path_serde() {
        let cursor =
            CursorState::selection(table_path(0, 2, 1, 0, 0, 0), table_path(0, 2, 1, 0, 0, 10));
        let json = serde_json::to_string(&cursor).unwrap();
        let back: CursorState = serde_json::from_str(&json).unwrap();
        assert_eq!(cursor, back);
    }

    // =========================================================================
    // 7. CursorState — sheet path
    // =========================================================================

    #[test]
    fn caret_sheet_path() {
        let cursor = CursorState::caret(sheet_path("Revenue", 10, 3));
        assert_eq!(cursor.anchor, sheet_path("Revenue", 10, 3));
    }

    #[test]
    fn selection_sheet_path_serde() {
        let cursor =
            CursorState::selection(sheet_path("Revenue", 10, 3), sheet_path("Revenue", 10, 7));
        let json = serde_json::to_string(&cursor).unwrap();
        let back: CursorState = serde_json::from_str(&json).unwrap();
        assert_eq!(cursor, back);
    }

    // =========================================================================
    // 8. CursorState — clone
    // =========================================================================

    #[test]
    fn clone_preserves_state() {
        let cursor = CursorState::selection(text_path(1, 0, 0), text_path(1, 0, 10));
        let cloned = cursor.clone();
        assert_eq!(cursor, cloned);
    }

    // =========================================================================
    // 9. CursorState — debug format
    // =========================================================================

    #[test]
    fn debug_format_contains_fields() {
        let cursor = CursorState::caret(text_path(1, 2, 3));
        let debug = format!("{cursor:?}");
        assert!(debug.contains("CursorState"));
        assert!(debug.contains("anchor"));
    }

    // =========================================================================
    // 10. CursorTracker — construction
    // =========================================================================

    #[test]
    fn new_tracker_is_empty() {
        let tracker = CursorTracker::new();
        assert_eq!(tracker.cursor_count(), 0);
        assert!(tracker.all_cursors().is_empty());
    }

    #[test]
    fn default_tracker_is_empty() {
        let tracker = CursorTracker::default();
        assert_eq!(tracker.cursor_count(), 0);
    }

    // =========================================================================
    // 11. CursorTracker — update
    // =========================================================================

    #[test]
    fn update_inserts_new_cursor() {
        let mut tracker = CursorTracker::new();
        let cursor = CursorState::caret(text_path(0, 0, 5));
        let changed = tracker.update_cursor("alice", cursor);
        assert!(changed);
        assert_eq!(tracker.cursor_count(), 1);
    }

    #[test]
    fn update_returns_false_for_identical_state() {
        let mut tracker = CursorTracker::new();
        let cursor = CursorState::caret(text_path(0, 0, 5));
        tracker.update_cursor("alice", cursor.clone());
        let changed = tracker.update_cursor("alice", cursor);
        assert!(!changed);
        assert_eq!(tracker.cursor_count(), 1);
    }

    #[test]
    fn update_returns_true_for_different_position() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        let changed = tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 10)));
        assert!(changed);
        assert_eq!(tracker.get("alice").unwrap().anchor, text_path(0, 0, 10));
    }

    #[test]
    fn update_returns_true_for_caret_to_selection() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        let changed = tracker.update_cursor(
            "alice",
            CursorState::selection(text_path(0, 0, 5), text_path(0, 0, 10)),
        );
        assert!(changed);
    }

    #[test]
    fn update_returns_true_for_selection_to_caret() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor(
            "alice",
            CursorState::selection(text_path(0, 0, 5), text_path(0, 0, 10)),
        );
        let changed = tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 7)));
        assert!(changed);
    }

    #[test]
    fn update_multiple_users() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        tracker.update_cursor("bob", CursorState::caret(text_path(1, 0, 0)));
        tracker.update_cursor("carol", CursorState::caret(text_path(2, 0, 3)));
        assert_eq!(tracker.cursor_count(), 3);
    }

    // =========================================================================
    // 12. CursorTracker — get
    // =========================================================================

    #[test]
    fn get_returns_none_for_unknown() {
        let tracker = CursorTracker::new();
        assert!(tracker.get("nobody").is_none());
    }

    #[test]
    fn get_returns_correct_state() {
        let mut tracker = CursorTracker::new();
        let cursor = CursorState::caret(text_path(3, 1, 14));
        tracker.update_cursor("alice", cursor);
        let retrieved = tracker.get("alice").unwrap();
        assert_eq!(retrieved.anchor, text_path(3, 1, 14));
        assert!(retrieved.is_caret());
    }

    // =========================================================================
    // 13. CursorTracker — remove
    // =========================================================================

    #[test]
    fn remove_existing_user() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        let removed = tracker.remove_cursor("alice");
        assert!(removed.is_some());
        assert_eq!(tracker.cursor_count(), 0);
        assert!(!tracker.has_cursor("alice"));
    }

    #[test]
    fn remove_nonexistent_user() {
        let mut tracker = CursorTracker::new();
        let removed = tracker.remove_cursor("nobody");
        assert!(removed.is_none());
    }

    #[test]
    fn remove_one_user_preserves_others() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        tracker.update_cursor("bob", CursorState::caret(text_path(1, 0, 0)));
        tracker.remove_cursor("alice");
        assert_eq!(tracker.cursor_count(), 1);
        assert!(tracker.has_cursor("bob"));
        assert!(!tracker.has_cursor("alice"));
    }

    // =========================================================================
    // 14. CursorTracker — others_cursors
    // =========================================================================

    #[test]
    fn others_cursors_excludes_target() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        tracker.update_cursor("bob", CursorState::caret(text_path(1, 0, 0)));
        tracker.update_cursor("carol", CursorState::caret(text_path(2, 0, 3)));

        let others = tracker.others_cursors("alice");
        assert_eq!(others.len(), 2);

        // Alice must not be present (INV-3)
        let user_ids: Vec<&str> = others.iter().map(|(uid, _)| *uid).collect();
        assert!(!user_ids.contains(&"alice"));

        // Bob and carol must be present
        assert!(user_ids.contains(&"bob"));
        assert!(user_ids.contains(&"carol"));
    }

    #[test]
    fn others_cursors_empty_when_no_others() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));

        let others = tracker.others_cursors("alice");
        assert!(others.is_empty());
    }

    #[test]
    fn others_cursors_all_when_exclude_unknown() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        tracker.update_cursor("bob", CursorState::caret(text_path(1, 0, 0)));

        let others = tracker.others_cursors("nobody");
        assert_eq!(others.len(), 2);
    }

    #[test]
    fn others_cursors_returns_correct_states() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        tracker.update_cursor(
            "bob",
            CursorState::selection(text_path(1, 0, 0), text_path(1, 0, 10)),
        );

        let others = tracker.others_cursors("alice");
        assert_eq!(others.len(), 1);
        let (uid, cursor) = &others[0];
        assert_eq!(*uid, "bob");
        assert!(cursor.is_selection());
    }

    // =========================================================================
    // 15. CursorTracker — user_ids
    // =========================================================================

    #[test]
    fn user_ids_returns_all() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 0)));
        tracker.update_cursor("bob", CursorState::caret(text_path(1, 0, 0)));
        let ids = tracker.user_ids();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"alice"));
        assert!(ids.contains(&"bob"));
    }

    #[test]
    fn user_ids_empty_when_no_cursors() {
        let tracker = CursorTracker::new();
        assert!(tracker.user_ids().is_empty());
    }

    // =========================================================================
    // 16. CursorTracker — clear
    // =========================================================================

    #[test]
    fn clear_removes_all() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        tracker.update_cursor("bob", CursorState::caret(text_path(1, 0, 0)));
        tracker.clear();
        assert_eq!(tracker.cursor_count(), 0);
    }

    // =========================================================================
    // 17. CursorTracker — has_cursor
    // =========================================================================

    #[test]
    fn has_cursor_true() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 0)));
        assert!(tracker.has_cursor("alice"));
    }

    #[test]
    fn has_cursor_false() {
        let tracker = CursorTracker::new();
        assert!(!tracker.has_cursor("alice"));
    }

    // =========================================================================
    // 18. CursorTracker — serde round-trip
    // =========================================================================

    #[test]
    fn tracker_serde_roundtrip() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        tracker.update_cursor(
            "bob",
            CursorState::selection(text_path(1, 0, 0), text_path(1, 0, 10)),
        );

        let json = serde_json::to_string(&tracker).unwrap();
        let back: CursorTracker = serde_json::from_str(&json).unwrap();

        assert_eq!(back.cursor_count(), 2);
        assert_eq!(back.get("alice").unwrap().anchor, text_path(0, 0, 5));
        assert!(back.get("bob").unwrap().is_selection());
    }

    // =========================================================================
    // 19. CursorTracker — clone
    // =========================================================================

    #[test]
    fn tracker_clone_preserves_state() {
        let mut tracker = CursorTracker::new();
        tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
        let cloned = tracker.clone();
        assert_eq!(cloned.cursor_count(), tracker.cursor_count());
        assert_eq!(
            cloned.get("alice").unwrap().anchor,
            tracker.get("alice").unwrap().anchor
        );
    }

    // =========================================================================
    // 20. CursorEvent — construction
    // =========================================================================

    #[test]
    fn caret_event_from_state() {
        let state = CursorState::caret(text_path(3, 1, 14));
        let event = CursorEvent::from_state("alice".into(), &state);
        assert_eq!(event.user_id, "alice");
        assert_eq!(event.anchor, text_path(3, 1, 14));
        assert!(event.focus.is_none());
    }

    #[test]
    fn selection_event_from_state() {
        let state = CursorState::selection(text_path(0, 0, 5), text_path(0, 0, 10));
        let event = CursorEvent::from_state("bob".into(), &state);
        assert_eq!(event.user_id, "bob");
        assert_eq!(event.anchor, text_path(0, 0, 5));
        assert_eq!(event.focus, Some(text_path(0, 0, 10)));
    }

    #[test]
    fn caret_event_convenience() {
        let event = CursorEvent::caret("alice".into(), text_path(0, 0, 5));
        assert!(event.focus.is_none());
    }

    #[test]
    fn selection_event_convenience() {
        let event = CursorEvent::selection("alice".into(), text_path(0, 0, 5), text_path(0, 0, 10));
        assert_eq!(event.focus, Some(text_path(0, 0, 10)));
    }

    // =========================================================================
    // 21. CursorEvent — to_cursor_state
    // =========================================================================

    #[test]
    fn caret_event_to_state() {
        let event = CursorEvent::caret("alice".into(), text_path(0, 0, 5));
        let state = event.to_cursor_state();
        assert!(state.is_caret());
        assert_eq!(state.anchor, text_path(0, 0, 5));
    }

    #[test]
    fn selection_event_to_state() {
        let event = CursorEvent::selection("alice".into(), text_path(0, 0, 5), text_path(0, 0, 10));
        let state = event.to_cursor_state();
        assert!(state.is_selection());
        assert_eq!(state.range().unwrap().start, text_path(0, 0, 5));
    }

    // =========================================================================
    // 22. CursorEvent — serde round-trip
    // =========================================================================

    #[test]
    fn caret_event_serde_roundtrip() {
        let event = CursorEvent::caret("alice".into(), text_path(3, 1, 14));
        let json = serde_json::to_string(&event).unwrap();
        let back: CursorEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event, back);
    }

    #[test]
    fn selection_event_serde_roundtrip() {
        let event = CursorEvent::selection("bob".into(), text_path(0, 0, 5), text_path(0, 0, 10));
        let json = serde_json::to_string(&event).unwrap();
        let back: CursorEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event, back);
    }

    #[test]
    fn event_json_missing_focus_when_caret() {
        let event = CursorEvent::caret("alice".into(), text_path(0, 0, 5));
        let val = serde_json::to_value(&event).unwrap();
        assert!(val.get("focus").is_none());
        assert_eq!(val["user_id"], "alice");
        assert_eq!(val["anchor"]["kind"], "text");
    }

    #[test]
    fn event_json_has_focus_when_selection() {
        let event = CursorEvent::selection("alice".into(), text_path(0, 0, 5), text_path(0, 0, 10));
        let val = serde_json::to_value(&event).unwrap();
        assert!(val.get("focus").is_some());
        assert_eq!(val["focus"]["kind"], "text");
    }

    // =========================================================================
    // 23. CursorEvent — table/sheet paths
    // =========================================================================

    #[test]
    fn event_table_path_roundtrip() {
        let event = CursorEvent::caret("alice".into(), table_path(0, 2, 1, 0, 0, 5));
        let json = serde_json::to_string(&event).unwrap();
        let back: CursorEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event, back);
    }

    #[test]
    fn event_sheet_path_roundtrip() {
        let event = CursorEvent::selection(
            "alice".into(),
            sheet_path("Revenue", 10, 3),
            sheet_path("Revenue", 10, 7),
        );
        let json = serde_json::to_string(&event).unwrap();
        let back: CursorEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event, back);
    }

    // =========================================================================
    // 24. CursorEvent — equality
    // =========================================================================

    #[test]
    fn event_equality_same() {
        let a = CursorEvent::caret("alice".into(), text_path(0, 0, 5));
        let b = CursorEvent::caret("alice".into(), text_path(0, 0, 5));
        assert_eq!(a, b);
    }

    #[test]
    fn event_inequality_different_user() {
        let a = CursorEvent::caret("alice".into(), text_path(0, 0, 5));
        let b = CursorEvent::caret("bob".into(), text_path(0, 0, 5));
        assert_ne!(a, b);
    }

    // =========================================================================
    // 25. 2-client live test (simulated)
    // =========================================================================

    mod two_client_live {
        use super::*;
        use wo_common::Path;

        fn text_path(para: usize, run: usize, char: usize) -> Path {
            Path::Text { para, run, char }
        }

        /// Simulate a 2-client collaborative session:
        /// - Alice and Bob join, each with a cursor.
        /// - Alice moves her cursor; Bob should see the update.
        /// - Bob makes a selection; Alice should see the selection.
        /// - Alice leaves; Bob should no longer see Alice's cursor.
        #[test]
        fn two_clients_cursor_sync() {
            let mut server_tracker = CursorTracker::new();

            // --- Alice joins at para 0, char 0 ---
            let alice_cursor = CursorState::caret(text_path(0, 0, 0));
            let alice_changed = server_tracker.update_cursor("alice", alice_cursor);
            assert!(alice_changed);

            // --- Bob joins at para 0, char 100 ---
            let bob_cursor = CursorState::caret(text_path(0, 0, 100));
            let bob_changed = server_tracker.update_cursor("bob", bob_cursor);
            assert!(bob_changed);

            // --- Alice queries: she should see Bob's cursor ---
            let alice_views = server_tracker.others_cursors("alice");
            assert_eq!(alice_views.len(), 1);
            let (bob_uid, bob_state) = &alice_views[0];
            assert_eq!(*bob_uid, "bob");
            assert_eq!(bob_state.anchor, text_path(0, 0, 100));

            // --- Bob queries: he should see Alice's cursor ---
            let bob_views = server_tracker.others_cursors("bob");
            assert_eq!(bob_views.len(), 1);
            let (alice_uid, alice_state) = &bob_views[0];
            assert_eq!(*alice_uid, "alice");
            assert_eq!(alice_state.anchor, text_path(0, 0, 0));

            // --- Alice types, moves cursor to char 10 ---
            let alice_moved = CursorState::caret(text_path(0, 0, 10));
            let changed = server_tracker.update_cursor("alice", alice_moved);
            assert!(changed);

            // Bob should now see Alice at char 10
            let bob_views = server_tracker.others_cursors("bob");
            let alice_state = bob_views.iter().find(|(uid, _)| *uid == "alice").unwrap().1;
            assert_eq!(alice_state.anchor, text_path(0, 0, 10));

            // --- Bob selects text from char 50 to char 75 ---
            let bob_selected = CursorState::selection(text_path(0, 0, 50), text_path(0, 0, 75));
            let changed = server_tracker.update_cursor("bob", bob_selected);
            assert!(changed);

            // Alice should see Bob's selection
            let alice_views = server_tracker.others_cursors("alice");
            let bob_state = alice_views.iter().find(|(uid, _)| *uid == "bob").unwrap().1;
            assert!(bob_state.is_selection());
            let range = bob_state.range().unwrap();
            assert_eq!(range.start, text_path(0, 0, 50));
            assert_eq!(range.end, text_path(0, 0, 75));

            // --- Alice leaves the session ---
            let removed = server_tracker.remove_cursor("alice");
            assert!(removed.is_some());

            // Bob should see no other cursors
            let bob_views = server_tracker.others_cursors("bob");
            assert!(bob_views.is_empty());

            // Server tracker should only have bob
            assert_eq!(server_tracker.cursor_count(), 1);
        }

        /// Simulate rapid cursor movement from both clients:
        /// verifies no data loss under interleaved updates.
        #[test]
        fn two_clients_interleaved_cursor_updates() {
            let mut server_tracker = CursorTracker::new();

            // Initial positions
            server_tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 0)));
            server_tracker.update_cursor("bob", CursorState::caret(text_path(0, 0, 50)));

            // Interleaved updates: Alice types, Bob types, Alice selects, Bob moves
            let alice_updates = vec![
                CursorState::caret(text_path(0, 0, 1)),
                CursorState::caret(text_path(0, 0, 2)),
                CursorState::caret(text_path(0, 0, 3)),
                CursorState::selection(text_path(0, 0, 1), text_path(0, 0, 3)),
                CursorState::caret(text_path(0, 0, 3)),
            ];

            let bob_updates = vec![
                CursorState::caret(text_path(0, 0, 51)),
                CursorState::caret(text_path(0, 0, 52)),
                CursorState::selection(text_path(0, 0, 48), text_path(0, 0, 52)),
                CursorState::caret(text_path(0, 0, 50)),
                CursorState::caret(text_path(0, 0, 48)),
            ];

            for (alice_op, bob_op) in alice_updates.into_iter().zip(bob_updates.into_iter()) {
                server_tracker.update_cursor("alice", alice_op);
                server_tracker.update_cursor("bob", bob_op);
            }

            // Both should still be present
            assert_eq!(server_tracker.cursor_count(), 2);
            assert!(server_tracker.has_cursor("alice"));
            assert!(server_tracker.has_cursor("bob"));

            // Final state: Alice at caret(0,0,3), Bob at caret(0,0,48)
            assert_eq!(
                server_tracker.get("alice").unwrap().anchor,
                text_path(0, 0, 3)
            );
            assert_eq!(
                server_tracker.get("bob").unwrap().anchor,
                text_path(0, 0, 48)
            );
        }

        /// Verify cursor events can be serialized and deserialized correctly
        /// as they would be sent over WebSocket.
        #[test]
        fn cursor_events_json_wire_format() {
            // Alice sends cursor update event
            let alice_event = CursorEvent::caret("alice".into(), text_path(0, 0, 10));
            let alice_json = serde_json::to_string(&alice_event).unwrap();

            // Bob receives and deserializes
            let received: CursorEvent = serde_json::from_str(&alice_json).unwrap();
            assert_eq!(received.user_id, "alice");
            assert_eq!(received.anchor, text_path(0, 0, 10));
            assert!(received.focus.is_none());

            // Bob sends selection event
            let bob_event =
                CursorEvent::selection("bob".into(), text_path(1, 0, 0), text_path(1, 0, 20));
            let bob_json = serde_json::to_string(&bob_event).unwrap();

            // Alice receives
            let received: CursorEvent = serde_json::from_str(&bob_json).unwrap();
            assert_eq!(received.user_id, "bob");
            assert_eq!(received.focus, Some(text_path(1, 0, 20)));

            // Convert to state and store in tracker
            let mut tracker = CursorTracker::new();
            tracker.update_cursor("alice", received.to_cursor_state());
            assert!(tracker.get("alice").unwrap().is_selection());
        }

        /// Verify duplicate cursor updates are properly deduplicated
        /// (server should not re-broadcast unchanged cursors).
        #[test]
        fn duplicate_cursor_update_not_rebroadcast() {
            let mut server_tracker = CursorTracker::new();

            // Alice moves to char 10
            let cursor = CursorState::caret(text_path(0, 0, 10));
            assert!(server_tracker.update_cursor("alice", cursor.clone()));

            // Alice sends same position again (duplicate)
            assert!(!server_tracker.update_cursor("alice", cursor.clone()));

            // Position unchanged
            assert_eq!(
                server_tracker.get("alice").unwrap().anchor,
                text_path(0, 0, 10)
            );

            // Only one entry for alice
            assert_eq!(server_tracker.cursor_count(), 1);
        }

        /// Verify cursor tracker serialization for late-join replay:
        /// a new client receives all existing cursors via JSON.
        #[test]
        fn late_join_cursor_sync() {
            let mut server_tracker = CursorTracker::new();

            // Existing session with Alice and Bob
            server_tracker.update_cursor(
                "alice",
                CursorState::selection(text_path(0, 0, 5), text_path(0, 0, 15)),
            );
            server_tracker.update_cursor("bob", CursorState::caret(text_path(1, 0, 0)));

            // Serialize full tracker state for late-joiner
            let json = serde_json::to_string(&server_tracker).unwrap();

            // Carol joins and deserializes
            let carol_tracker: CursorTracker = serde_json::from_str(&json).unwrap();
            assert_eq!(carol_tracker.cursor_count(), 2);

            // Carol should see both cursors
            let others = carol_tracker.others_cursors("carol");
            assert_eq!(others.len(), 2);

            // Verify Alice's selection and Bob's caret
            let alice_state = others.iter().find(|(uid, _)| *uid == "alice").unwrap().1;
            assert!(alice_state.is_selection());

            let bob_state = others.iter().find(|(uid, _)| *uid == "bob").unwrap().1;
            assert!(bob_state.is_caret());
        }

        /// Users in different document paths (text vs table vs sheet)
        /// can have cursors simultaneously.
        #[test]
        fn users_in_different_paths() {
            let mut server_tracker = CursorTracker::new();

            server_tracker.update_cursor("alice", CursorState::caret(text_path(0, 0, 5)));
            server_tracker.update_cursor("bob", CursorState::caret(table_path(0, 2, 1, 0, 0, 3)));
            server_tracker.update_cursor("carol", CursorState::caret(sheet_path("Revenue", 10, 5)));

            assert_eq!(server_tracker.cursor_count(), 3);

            // Each user should see the other two
            let alice_others = server_tracker.others_cursors("alice");
            assert_eq!(alice_others.len(), 2);

            let bob_others = server_tracker.others_cursors("bob");
            assert_eq!(bob_others.len(), 2);

            let carol_others = server_tracker.others_cursors("carol");
            assert_eq!(carol_others.len(), 2);
        }
    }

    // =========================================================================
    // 26. Unicode safety — path with multi-byte content (Sheet name)
    // =========================================================================

    #[test]
    fn unicode_sheet_name_in_cursor() {
        let cursor = CursorState::caret(sheet_path("📊数据", 10, 5));
        let json = serde_json::to_string(&cursor).unwrap();
        let back: CursorState = serde_json::from_str(&json).unwrap();
        assert_eq!(cursor, back);
    }

    #[test]
    fn unicode_sheet_name_in_event() {
        let event = CursorEvent::caret("alice".into(), sheet_path("こんにちは", 3, 7));
        let json = serde_json::to_string(&event).unwrap();
        let back: CursorEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event, back);
    }
}
