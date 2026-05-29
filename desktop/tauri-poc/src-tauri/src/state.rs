use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::env;

const MAX_RECENT_FILES: usize = 10;
const RECENT_FILES_KEY: &str = "recent_files.json";
const SESSION_FILE: &str = "session.json";

#[derive(Default)]
pub struct AppState {
    pub recent_files: Mutex<Vec<String>>,
    pub window_count: Mutex<u32>,
}

impl AppState {
    pub fn new() -> Self {
        let state = Self::default();
        state.load_recent_files();
        state
    }

    pub fn add_recent_file(&self, path: String) {
        let mut recent = self.recent_files.lock().unwrap();
        recent.retain(|p| p != &path);
        recent.insert(0, path);
        if recent.len() > MAX_RECENT_FILES {
            recent.truncate(MAX_RECENT_FILES);
        }
        drop(recent);
        self.save_recent_files();
    }

    pub fn get_recent_files(&self) -> Vec<String> {
        self.recent_files.lock().unwrap().clone()
    }

    fn get_storage_path() -> Option<PathBuf> {
        dirs::data_local_dir().map(|dir| dir.join("WorldOffice").join(RECENT_FILES_KEY))
    }

    fn load_recent_files(&self) {
        if let Some(path) = Self::get_storage_path() {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(files) = serde_json::from_str::<Vec<String>>(&content) {
                        *self.recent_files.lock().unwrap() = files;
                    }
                }
            }
        }
    }

    fn save_recent_files(&self) {
        if let Some(path) = Self::get_storage_path() {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let files = self.recent_files.lock().unwrap().clone();
            let _ = fs::write(&path, serde_json::to_string(&files).unwrap_or_default());
        }
    }
}

fn data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join("WorldOffice"))
}

pub struct SessionState {
    pub open_documents: Mutex<Vec<String>>,
}

impl SessionState {
    pub fn new() -> Self {
        let docs = Self::load_documents();
        Self {
            open_documents: Mutex::new(docs),
        }
    }

    pub fn add_document(&self, path: String) {
        let mut docs = self.open_documents.lock().unwrap();
        if !docs.contains(&path) {
            docs.push(path);
        }
        let docs_to_save = docs.clone();
        drop(docs);
        self.save_with_docs(docs_to_save);
    }

    pub fn remove_document(&self, label: &str) {
        let mut docs = self.open_documents.lock().unwrap();
        docs.retain(|d| d != label);
        let docs_to_save = docs.clone();
        drop(docs);
        self.save_with_docs(docs_to_save);
    }

    fn save_with_docs(&self, docs: Vec<String>) {
        if let Some(path) = Self::session_path() {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&path, serde_json::to_string(&docs).unwrap_or_default());
        }
    }

    fn save(&self) {
        let docs = self.open_documents.lock().unwrap().clone();
        self.save_with_docs(docs);
    }

    pub fn get_open_documents(&self) -> Vec<String> {
        self.open_documents.lock().unwrap().clone()
    }

    fn session_path() -> Option<PathBuf> {
        data_dir().map(|dir| dir.join(SESSION_FILE))
    }

    fn load_documents() -> Vec<String> {
        Self::session_path()
            .and_then(|path| {
                fs::read_to_string(&path).ok().and_then(|content| {
                    serde_json::from_str::<Vec<String>>(&content).ok()
                })
            })
            .unwrap_or_default()
    }
}

    #[cfg(test)]
    mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn test_app_state_new() {
        // Clear any existing recent files to ensure test isolation
        if let Some(path) = AppState::get_storage_path() {
            let _ = fs::remove_file(&path);
        }
        
        let state = AppState::new();
        assert_eq!(state.get_recent_files().len(), 0);
        assert_eq!(*state.window_count.lock().unwrap(), 0);
    }

    #[test]
    fn test_add_recent_file() {
        // Clear any existing recent files to ensure test isolation
        if let Some(path) = AppState::get_storage_path() {
            let _ = fs::remove_file(&path);
        }
        
        let state = AppState::new();
        state.add_recent_file("/test/path/document.docx".to_string());
        let recent = state.get_recent_files();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0], "/test/path/document.docx");
    }

    #[test]
    fn test_recent_files_max() {
        if let Some(path) = AppState::get_storage_path() {
            let _ = fs::remove_file(&path);
        }
        let state = AppState::new();
        // Add 15 files
        for i in 0..15 {
            state.add_recent_file(format!("/test/path/file{}.txt", i));
        }
        let recent = state.get_recent_files();
        // Should only keep last 10
        assert_eq!(recent.len(), 10);
        // First should be file14 (most recent)
        assert_eq!(recent[0], "/test/path/file14.txt");
        // Last should be file5 (least recent of kept files)
        assert_eq!(recent[9], "/test/path/file5.txt");
    }

    #[test]
    fn test_session_state_new() {
        if let Some(p) = SessionState::session_path() {
            let _ = fs::remove_file(&p);
        }
        let state = SessionState::new();
        let docs = state.get_open_documents();
        assert_eq!(docs.len(), 0);
    }

    #[test]
    fn test_session_add_remove() {
        if let Some(p) = SessionState::session_path() {
            let _ = fs::remove_file(&p);
        }
        let state = SessionState::new();
        state.add_document("test.doc".to_string());
        let docs = state.get_open_documents();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0], "test.doc");

        state.remove_document("test.doc");
        let docs = state.get_open_documents();
        assert_eq!(docs.len(), 0);
    }

    #[test]
    fn test_session_persist_and_load() {
        let temp = env::temp_dir().join("wo-test-session.json");
        let _ = fs::remove_file(&temp);
        let _ = fs::create_dir_all(temp.parent().unwrap());

        let data = vec!["test.doc".to_string()];
        let json = serde_json::to_string(&data).unwrap();
        fs::write(&temp, &json).unwrap();

        let raw = fs::read_to_string(&temp).unwrap();
        let parsed: Vec<String> = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0], "test.doc");

        let _ = fs::remove_file(&temp);
    }
}
