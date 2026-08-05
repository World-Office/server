//! ScimRepository — SQLite-backed SCIM user and group persistence.

use crate::models::{ScimGroup, ScimMeta, ScimMultiValue, ScimUser};
use rusqlite::Connection;
use std::path::Path;

/// Database‑backed store for SCIM Users and Groups.
pub struct ScimRepository {
    conn: Connection,
}

impl ScimRepository {
    pub fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let repo = Self { conn };
        repo.init_tables()?;
        Ok(repo)
    }

    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let repo = Self { conn };
        repo.init_tables()?;
        Ok(repo)
    }

    fn init_tables(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS scim_users (
                id              TEXT PRIMARY KEY,
                user_name       TEXT NOT NULL UNIQUE,
                name_formatted  TEXT,
                name_given      TEXT,
                name_family     TEXT,
                display_name    TEXT,
                active          INTEGER NOT NULL DEFAULT 1,
                emails          TEXT NOT NULL DEFAULT '[]',
                phone_numbers   TEXT NOT NULL DEFAULT '[]',
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scim_groups (
                id              TEXT PRIMARY KEY,
                display_name    TEXT NOT NULL UNIQUE,
                members         TEXT NOT NULL DEFAULT '[]',
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            );",
        )?;
        Ok(())
    }

    pub fn insert_user(&mut self, user: &ScimUser) -> Result<String, rusqlite::Error> {
        let id = user
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();
        let active = user.active.unwrap_or(true) as i64;
        let emails = serde_json::to_string(&user.emails).unwrap_or_else(|_| "[]".to_string());
        let phones =
            serde_json::to_string(&user.phone_numbers).unwrap_or_else(|_| "[]".to_string());
        let name_formatted = user.name.as_ref().and_then(|n| n.formatted.as_deref());
        let name_given = user.name.as_ref().and_then(|n| n.given_name.as_deref());
        let name_family = user.name.as_ref().and_then(|n| n.family_name.as_deref());

        self.conn.execute(
            "INSERT INTO scim_users (id, user_name, name_formatted, name_given, name_family,
             display_name, active, emails, phone_numbers, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                id,
                user.user_name,
                name_formatted,
                name_given,
                name_family,
                user.display_name,
                active,
                emails,
                phones,
                now,
                now,
            ],
        )?;
        Ok(id)
    }

    pub fn get_user(&self, id: &str) -> Result<Option<ScimUser>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, user_name, name_formatted, name_given, name_family,
             display_name, active, emails, phone_numbers, created_at, updated_at
             FROM scim_users WHERE id = ?1",
        )?;
        let mut rows = stmt.query(rusqlite::params![id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_user(row)?)),
            None => Ok(None),
        }
    }

    pub fn get_user_by_name(&self, user_name: &str) -> Result<Option<ScimUser>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, user_name, name_formatted, name_given, name_family,
             display_name, active, emails, phone_numbers, created_at, updated_at
             FROM scim_users WHERE user_name = ?1",
        )?;
        let mut rows = stmt.query(rusqlite::params![user_name])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_user(row)?)),
            None => Ok(None),
        }
    }

    pub fn list_users(&self) -> Result<Vec<ScimUser>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, user_name, name_formatted, name_given, name_family,
             display_name, active, emails, phone_numbers, created_at, updated_at
             FROM scim_users ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_user)?;
        rows.collect::<Result<Vec<_>, _>>()
    }

    pub fn update_user(&mut self, id: &str, user: &ScimUser) -> Result<bool, rusqlite::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        let active = user.active.unwrap_or(true) as i64;
        let emails = serde_json::to_string(&user.emails).unwrap_or_else(|_| "[]".to_string());
        let phones =
            serde_json::to_string(&user.phone_numbers).unwrap_or_else(|_| "[]".to_string());
        let name_formatted = user.name.as_ref().and_then(|n| n.formatted.as_deref());
        let name_given = user.name.as_ref().and_then(|n| n.given_name.as_deref());
        let name_family = user.name.as_ref().and_then(|n| n.family_name.as_deref());

        let affected = self.conn.execute(
            "UPDATE scim_users SET user_name = ?1, name_formatted = ?2, name_given = ?3,
             name_family = ?4, display_name = ?5, active = ?6, emails = ?7,
             phone_numbers = ?8, updated_at = ?9
             WHERE id = ?10",
            rusqlite::params![
                user.user_name,
                name_formatted,
                name_given,
                name_family,
                user.display_name,
                active,
                emails,
                phones,
                now,
                id,
            ],
        )?;
        Ok(affected > 0)
    }

    pub fn patch_user(
        &mut self,
        id: &str,
        patch: &serde_json::Value,
    ) -> Result<bool, rusqlite::Error> {
        // SCIM PATCH uses Operations array with op/path/value.
        // We apply simple top-level attribute replacements.
        let now = chrono::Utc::now().to_rfc3339();
        let existing = self.get_user(id)?;
        let mut user = match existing {
            Some(u) => u,
            None => return Ok(false),
        };

        if let Some(ops) = patch.get("Operations").and_then(|v| v.as_array()) {
            for op in ops {
                let op_type = op.get("op").and_then(|v| v.as_str()).unwrap_or("");
                match op_type {
                    "replace" | "add" => {
                        if let Some(value) = op.get("value") {
                            apply_patch_to_user(&mut user, value);
                        }
                        if let Some(path) = op.get("path").and_then(|v| v.as_str())
                            && let Some(value) = op.get("value") {
                                apply_patch_path_to_user(&mut user, path, value);
                            }
                    }
                    "remove" => {
                        if let Some(path) = op.get("path").and_then(|v| v.as_str()) {
                            apply_remove_path_to_user(&mut user, path);
                        }
                    }
                    _ => {}
                }
            }
        }

        let active = user.active.unwrap_or(true) as i64;
        let emails = serde_json::to_string(&user.emails).unwrap_or_else(|_| "[]".to_string());
        let phones =
            serde_json::to_string(&user.phone_numbers).unwrap_or_else(|_| "[]".to_string());
        let name_formatted = user.name.as_ref().and_then(|n| n.formatted.as_deref());
        let name_given = user.name.as_ref().and_then(|n| n.given_name.as_deref());
        let name_family = user.name.as_ref().and_then(|n| n.family_name.as_deref());

        let affected = self.conn.execute(
            "UPDATE scim_users SET user_name = ?1, name_formatted = ?2, name_given = ?3,
             name_family = ?4, display_name = ?5, active = ?6, emails = ?7,
             phone_numbers = ?8, updated_at = ?9
             WHERE id = ?10",
            rusqlite::params![
                user.user_name,
                name_formatted,
                name_given,
                name_family,
                user.display_name,
                active,
                emails,
                phones,
                now,
                id,
            ],
        )?;
        Ok(affected > 0)
    }

    pub fn delete_user(&mut self, id: &str) -> Result<bool, rusqlite::Error> {
        let affected = self.conn.execute(
            "DELETE FROM scim_users WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(affected > 0)
    }

    pub fn insert_group(&mut self, group: &ScimGroup) -> Result<String, rusqlite::Error> {
        let id = group
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();
        let members = serde_json::to_string(&group.members).unwrap_or_else(|_| "[]".to_string());

        self.conn.execute(
            "INSERT INTO scim_groups (id, display_name, members, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, group.display_name, members, now, now],
        )?;
        Ok(id)
    }

    pub fn get_group(&self, id: &str) -> Result<Option<ScimGroup>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, display_name, members, created_at, updated_at
             FROM scim_groups WHERE id = ?1",
        )?;
        let mut rows = stmt.query(rusqlite::params![id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_group(row)?)),
            None => Ok(None),
        }
    }

    pub fn list_groups(&self) -> Result<Vec<ScimGroup>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, display_name, members, created_at, updated_at
             FROM scim_groups ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_group)?;
        rows.collect::<Result<Vec<_>, _>>()
    }

    pub fn update_group(&mut self, id: &str, group: &ScimGroup) -> Result<bool, rusqlite::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        let members = serde_json::to_string(&group.members).unwrap_or_else(|_| "[]".to_string());

        let affected = self.conn.execute(
            "UPDATE scim_groups SET display_name = ?1, members = ?2, updated_at = ?3
             WHERE id = ?4",
            rusqlite::params![group.display_name, members, now, id],
        )?;
        Ok(affected > 0)
    }

    pub fn delete_group(&mut self, id: &str) -> Result<bool, rusqlite::Error> {
        let affected = self.conn.execute(
            "DELETE FROM scim_groups WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(affected > 0)
    }
}

fn row_to_user(row: &rusqlite::Row<'_>) -> Result<ScimUser, rusqlite::Error> {
    let id: String = row.get(0)?;
    let user_name: String = row.get(1)?;
    let name_formatted: Option<String> = row.get(2)?;
    let name_given: Option<String> = row.get(3)?;
    let name_family: Option<String> = row.get(4)?;
    let display_name: Option<String> = row.get(5)?;
    let active: i64 = row.get(6)?;
    let emails_str: String = row.get(7)?;
    let phones_str: String = row.get(8)?;
    let created_at: String = row.get(9)?;
    let updated_at: String = row.get(10)?;

    let name = if name_formatted.is_some() || name_given.is_some() || name_family.is_some() {
        Some(crate::models::ScimUserName {
            formatted: name_formatted,
            given_name: name_given,
            family_name: name_family,
        })
    } else {
        None
    };

    let emails: Vec<ScimMultiValue> = serde_json::from_str(&emails_str).unwrap_or_default();
    let phone_numbers: Vec<ScimMultiValue> = serde_json::from_str(&phones_str).unwrap_or_default();

    Ok(ScimUser {
        schemas: vec![crate::models::SCHEMA_USER.to_string()],
        id: Some(id),
        user_name,
        name,
        display_name,
        active: Some(active != 0),
        emails: Some(emails),
        phone_numbers: Some(phone_numbers),
        meta: Some(ScimMeta {
            resource_type: "User".to_string(),
            created: created_at,
            last_modified: updated_at,
            location: None,
            version: None,
        }),
    })
}

fn row_to_group(row: &rusqlite::Row<'_>) -> Result<ScimGroup, rusqlite::Error> {
    let id: String = row.get(0)?;
    let display_name: String = row.get(1)?;
    let members_str: String = row.get(2)?;
    let created_at: String = row.get(3)?;
    let updated_at: String = row.get(4)?;

    let members: Vec<ScimMultiValue> = serde_json::from_str(&members_str).unwrap_or_default();

    Ok(ScimGroup {
        schemas: vec![crate::models::SCHEMA_GROUP.to_string()],
        id: Some(id),
        display_name,
        members: Some(members),
        meta: Some(ScimMeta {
            resource_type: "Group".to_string(),
            created: created_at,
            last_modified: updated_at,
            location: None,
            version: None,
        }),
    })
}

fn apply_patch_to_user(user: &mut ScimUser, value: &serde_json::Value) {
    if let Some(obj) = value.as_object() {
        if let Some(v) = obj.get("userName").and_then(|v| v.as_str()) {
            user.user_name = v.to_string();
        }
        if let Some(v) = obj.get("displayName").and_then(|v| v.as_str()) {
            user.display_name = Some(v.to_string());
        }
        if let Some(v) = obj.get("active").and_then(|v| v.as_bool()) {
            user.active = Some(v);
        }
        if let Some(v) = obj.get("name")
            && let Ok(n) = serde_json::from_value(v.clone()) {
                user.name = Some(n);
            }
        if let Some(v) = obj.get("emails")
            && let Ok(e) = serde_json::from_value(v.clone()) {
                user.emails = Some(e);
            }
        if let Some(v) = obj.get("phoneNumbers")
            && let Ok(p) = serde_json::from_value(v.clone()) {
                user.phone_numbers = Some(p);
            }
    }
}

fn apply_patch_path_to_user(user: &mut ScimUser, path: &str, value: &serde_json::Value) {
    match path {
        "userName" => {
            if let Some(v) = value.as_str() {
                user.user_name = v.to_string();
            }
        }
        "displayName" => {
            if let Some(v) = value.as_str() {
                user.display_name = Some(v.to_string());
            }
        }
        "active" => {
            if let Some(v) = value.as_bool() {
                user.active = Some(v);
            }
        }
        "emails" => {
            if let Ok(e) = serde_json::from_value(value.clone()) {
                user.emails = Some(e);
            }
        }
        "phoneNumbers" => {
            if let Ok(p) = serde_json::from_value(value.clone()) {
                user.phone_numbers = Some(p);
            }
        }
        "name.formatted" => {
            if let Some(v) = value.as_str() {
                user.name
                    .get_or_insert(crate::models::ScimUserName {
                        formatted: None,
                        given_name: None,
                        family_name: None,
                    })
                    .formatted = Some(v.to_string());
            }
        }
        "name.givenName" => {
            if let Some(v) = value.as_str() {
                user.name
                    .get_or_insert(crate::models::ScimUserName {
                        formatted: None,
                        given_name: None,
                        family_name: None,
                    })
                    .given_name = Some(v.to_string());
            }
        }
        "name.familyName" => {
            if let Some(v) = value.as_str() {
                user.name
                    .get_or_insert(crate::models::ScimUserName {
                        formatted: None,
                        given_name: None,
                        family_name: None,
                    })
                    .family_name = Some(v.to_string());
            }
        }
        _ => {}
    }
}

fn apply_remove_path_to_user(user: &mut ScimUser, path: &str) {
    match path {
        "displayName" => user.display_name = None,
        "emails" => user.emails = None,
        "phoneNumbers" => user.phone_numbers = None,
        "name" => user.name = None,
        "name.formatted" => {
            if let Some(ref mut n) = user.name {
                n.formatted = None;
            }
        }
        "name.givenName" => {
            if let Some(ref mut n) = user.name {
                n.given_name = None;
            }
        }
        "name.familyName" => {
            if let Some(ref mut n) = user.name {
                n.family_name = None;
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    fn make_user(id: &str) -> ScimUser {
        let mut user = ScimUser::new(id.to_string(), format!("user_{}", id));
        user.name = Some(ScimUserName {
            formatted: Some(format!("User {}", id)),
            given_name: Some(format!("First{}", id)),
            family_name: Some(format!("Last{}", id)),
        });
        user.display_name = Some(format!("User {}", id));
        user.emails = Some(vec![ScimMultiValue {
            value: format!("{}@example.com", id),
            type_: Some("work".to_string()),
            primary: Some(true),
            display: None,
            operation: None,
            ref_: None,
        }]);
        user
    }

    fn make_group(id: &str) -> ScimGroup {
        ScimGroup::new(id.to_string(), format!("Group {}", id))
    }

    #[test]
    fn insert_and_get_user() {
        let mut repo = ScimRepository::new_in_memory().unwrap();
        let id = repo.insert_user(&make_user("abc")).unwrap();
        let got = repo.get_user(&id).unwrap().unwrap();
        assert_eq!(got.user_name, "user_abc");
        assert!(got.active.unwrap_or(false));
        assert_eq!(
            got.name.as_ref().unwrap().given_name.as_deref(),
            Some("Firstabc")
        );
    }

    #[test]
    fn get_user_missing_returns_none() {
        let repo = ScimRepository::new_in_memory().unwrap();
        assert!(repo.get_user("nope").unwrap().is_none());
    }

    #[test]
    fn list_users() {
        let mut repo = ScimRepository::new_in_memory().unwrap();
        repo.insert_user(&make_user("a")).unwrap();
        repo.insert_user(&make_user("b")).unwrap();
        let list = repo.list_users().unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn delete_user() {
        let mut repo = ScimRepository::new_in_memory().unwrap();
        let id = repo.insert_user(&make_user("del")).unwrap();
        assert!(repo.get_user(&id).unwrap().is_some());
        assert!(repo.delete_user(&id).unwrap());
        assert!(repo.get_user(&id).unwrap().is_none());
    }

    #[test]
    fn update_user() {
        let mut repo = ScimRepository::new_in_memory().unwrap();
        let id = repo.insert_user(&make_user("upd")).unwrap();
        let mut user = make_user("upd");
        user.display_name = Some("Updated".to_string());
        assert!(repo.update_user(&id, &user).unwrap());
        let got = repo.get_user(&id).unwrap().unwrap();
        assert_eq!(got.display_name.as_deref(), Some("Updated"));
    }

    #[test]
    fn insert_and_get_group() {
        let mut repo = ScimRepository::new_in_memory().unwrap();
        let id = repo.insert_group(&make_group("eng")).unwrap();
        let got = repo.get_group(&id).unwrap().unwrap();
        assert_eq!(got.display_name, "Group eng");
    }

    #[test]
    fn list_groups() {
        let mut repo = ScimRepository::new_in_memory().unwrap();
        repo.insert_group(&make_group("a")).unwrap();
        repo.insert_group(&make_group("b")).unwrap();
        let list = repo.list_groups().unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn delete_group() {
        let mut repo = ScimRepository::new_in_memory().unwrap();
        let id = repo.insert_group(&make_group("del")).unwrap();
        assert!(repo.delete_group(&id).unwrap());
        assert!(repo.get_group(&id).unwrap().is_none());
    }

    #[test]
    fn persistence_across_restarts() {
        let dir = std::env::temp_dir().join(format!(
            "wo-scim-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("scim.db");

        {
            let mut repo = ScimRepository::new(&db_path).unwrap();
            repo.insert_user(&make_user("persist-1")).unwrap();
            repo.insert_group(&make_group("persist-g")).unwrap();
        }
        {
            let repo = ScimRepository::new(&db_path).unwrap();
            let users = repo.list_users().unwrap();
            assert_eq!(users.len(), 1);
            let groups = repo.list_groups().unwrap();
            assert_eq!(groups.len(), 1);
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
