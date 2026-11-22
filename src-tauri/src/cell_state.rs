//! Where a document's widget state lives: what a cell's sliders and views were
//! set to, kept across reloads.
//!
//! The document carries no widget state (the format rule), and the app does
//! not append to pi's transcript (ADR 0021), so the state has a store of its
//! own: one JSON file per document, under the app's data directory and the
//! workspace's slug, so two workspaces' `welcome` documents never share one.
//!
//! A file holding JSON `null` is a record in its own right — "checked, nothing
//! there" — distinct from no file at all, which is "never checked". The page
//! reads state an earlier Piary left in a transcript once, on a document's
//! first open, and writes that record either way so it never asks again.
//!
//! No `tauri::` types (ADR 0014).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::docs;

/// The largest state accepted. Far above any widget state seen, and the
/// browser bridge's cap on a rebuild's body.
pub const MAX_BYTES: usize = 4 * 1024 * 1024;

/// Where one workspace's widget state lives.
pub fn dir(app_data: &Path, workspace: &Path) -> PathBuf {
    app_data.join("cell-state").join(docs::cwd_slug(workspace))
}

/// The file one document id names, behind the document store's id guard.
fn path_of(dir: &Path, id: &str) -> Result<PathBuf, String> {
    docs::check_id(id).map_err(|bad| bad.message().to_string())?;
    Ok(dir.join(format!("{id}.json")))
}

/// The state kept for `id`: `None` when nothing was ever written, `Some(Null)`
/// when the record says there is none. A file that cannot be read or parsed is
/// `None`, as a corrupt window layout is: the defaults are honest.
pub fn read(dir: &Path, id: &str) -> Result<Option<Value>, String> {
    let path = path_of(dir, id)?;
    Ok(fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok()))
}

/// Keeps `state` for `id`, atomically. Over `MAX_BYTES` is refused and the
/// previous file stays.
pub fn write(dir: &Path, id: &str, state: &Value) -> Result<(), String> {
    let path = path_of(dir, id)?;
    let text = state.to_string();
    if text.len() > MAX_BYTES {
        return Err(format!(
            "widget state of {} bytes is over the {MAX_BYTES}-byte cap",
            text.len()
        ));
    }
    fs::create_dir_all(dir).map_err(|e| format!("creating the widget-state directory: {e}"))?;
    docs::write_atomically(&path, &text)
}

/// Forgets `id`'s state. None kept is already forgotten.
pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    match fs::remove_file(path_of(dir, id)?) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("forgetting {id}'s widget state: {error}"))
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// An app-data directory under the OS temp dir, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("piary-cell-state-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn nothing_saved_reads_as_none() {
        let scratch = Scratch::new("none");
        let at = dir(&scratch.0, Path::new("/work/a"));
        assert_eq!(read(&at, "welcome").unwrap(), None);
    }

    #[test]
    fn a_written_state_reads_back_equal() {
        let scratch = Scratch::new("roundtrip");
        let at = dir(&scratch.0, Path::new("/work/a"));
        let state = json!({"v": 2, "views": {}, "store": {"n": 7}});
        write(&at, "welcome", &state).unwrap();
        assert_eq!(read(&at, "welcome").unwrap(), Some(state));
    }

    #[test]
    fn a_checked_and_empty_record_is_not_the_same_as_no_record() {
        let scratch = Scratch::new("null");
        let at = dir(&scratch.0, Path::new("/work/a"));
        write(&at, "welcome", &Value::Null).unwrap();
        assert_eq!(read(&at, "welcome").unwrap(), Some(Value::Null));
    }

    #[test]
    fn two_workspaces_same_id_do_not_share_a_file() {
        let scratch = Scratch::new("workspaces");
        let a = dir(&scratch.0, Path::new("/work/a"));
        let b = dir(&scratch.0, Path::new("/work/b"));
        write(&a, "welcome", &json!({"store": {"n": 1}})).unwrap();
        assert_eq!(read(&b, "welcome").unwrap(), None);
    }

    #[test]
    fn an_id_the_guard_refuses_is_refused_here_and_nothing_is_written() {
        let scratch = Scratch::new("guard");
        let at = dir(&scratch.0, Path::new("/work/a"));
        assert!(write(&at, "../escape", &json!({})).is_err());
        assert!(read(&at, "../escape").is_err());
        assert!(!scratch.0.join("escape.json").exists());
        // The paired case that must still work.
        assert!(write(&at, "web-landing", &json!({})).is_ok());
    }

    #[test]
    fn deleted_state_reads_as_never_written() {
        let scratch = Scratch::new("delete");
        let at = dir(&scratch.0, Path::new("/work/a"));
        write(&at, "welcome", &json!({"store": {}})).unwrap();
        write(&at, "kept", &json!({"store": {}})).unwrap();
        delete(&at, "welcome").unwrap();
        assert_eq!(read(&at, "welcome").unwrap(), None);
        assert!(read(&at, "kept").unwrap().is_some());
        assert!(delete(&at, "welcome").is_ok());
        assert!(delete(&at, "../escape").is_err());
    }

    #[test]
    fn a_corrupt_file_reads_as_none() {
        let scratch = Scratch::new("corrupt");
        let at = dir(&scratch.0, Path::new("/work/a"));
        fs::create_dir_all(&at).unwrap();
        fs::write(at.join("welcome.json"), "{not json").unwrap();
        assert_eq!(read(&at, "welcome").unwrap(), None);
    }

    #[test]
    fn a_state_over_the_cap_is_refused_and_the_previous_file_survives() {
        let scratch = Scratch::new("cap");
        let at = dir(&scratch.0, Path::new("/work/a"));
        let kept = json!({"store": {"n": 1}});
        write(&at, "welcome", &kept).unwrap();
        let huge = json!({"store": {"blob": "x".repeat(MAX_BYTES + 1)}});
        assert!(write(&at, "welcome", &huge).is_err());
        assert_eq!(read(&at, "welcome").unwrap(), Some(kept));
    }
}
