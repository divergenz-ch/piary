//! Writing a session's transcript whole, for a rebuild (ADR 0021).
//!
//! The page decides what pi's history should be — it reads the transcript over
//! the wire (`get_entries`) and rewrites it from the document — and this writes
//! the result where pi keeps it. It never parses an entry: each is one line,
//! serialised as the page sent it. The one part of pi's transcript format it
//! knows is the header, the first line, which it keeps byte for byte or, for a
//! session pi has not written yet, seeds the way pi would.
//!
//! No `tauri::` types (ADR 0014).

use std::fs;
use std::path::Path;

use serde_json::{json, Value};

use crate::docs;

/// Whether `id` is a session id this app hands to pi: word characters and
/// dashes, nothing that could reach outside a file name.
pub fn is_session_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Whether `path` is a transcript pi would write for `sid`: absolute, and
/// named `<timestamp>_<sid>.jsonl`. The path comes from the page, which got it
/// from pi's `get_state`; anything else is refused rather than written.
pub fn is_session_file(path: &Path, sid: &str) -> bool {
    path.is_absolute()
        && is_session_id(sid)
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(&format!("_{sid}.jsonl")))
}

/// Removes `sid`'s transcript at `path`, which must be a transcript pi would
/// write for it (`is_session_file`). One that is not there is already removed.
pub fn delete(path: &Path, sid: &str) -> Result<(), String> {
    if !is_session_file(path, sid) {
        return Err(format!(
            "{} is not a transcript for session {sid}",
            path.display()
        ));
    }
    match fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("deleting {sid}'s transcript: {error}"))
        }
        _ => Ok(()),
    }
}

/// Replaces the transcript at `path` with its header and `entries`, atomically.
///
/// The header is the existing file's first line, kept byte for byte; with no
/// file, it is the one pi writes for a new session, naming `sid` and `cwd`. The
/// entries follow one per line in order, so the last is the leaf pi loads. The
/// caller has stopped the session's pi: one still running could append after
/// this, and the file must end at the leaf.
pub fn rewrite(
    path: &Path,
    sid: &str,
    cwd: &str,
    entries: &[Value],
    now: &str,
) -> Result<(), String> {
    if !is_session_file(path, sid) {
        return Err(format!(
            "refusing to write {}: not a transcript for session {sid}",
            path.display()
        ));
    }
    let header = match fs::read_to_string(path) {
        Ok(text) => text.split('\n').next().unwrap_or_default().to_string(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            json!({ "type": "session", "version": 3, "id": sid, "timestamp": now, "cwd": cwd })
                .to_string()
        }
        Err(error) => return Err(format!("reading the transcript: {error}")),
    };
    let mut content = header;
    content.push('\n');
    for entry in entries {
        content.push_str(&entry.to_string());
        content.push('\n');
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("creating the session directory: {e}"))?;
    }
    docs::write_atomically(path, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A session directory under the OS temp dir, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("piary-transcript-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
        fn file(&self, sid: &str) -> PathBuf {
            self.0.join(format!("2026-01-01T00-00-00-000Z_{sid}.jsonl"))
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_session_transcript_is_deleted_and_another_sessions_is_refused() {
        let scratch = Scratch::new("delete");
        let mine = scratch.file("web-1");
        let theirs = scratch.file("web-2");
        fs::write(&mine, "{}\n").unwrap();
        fs::write(&theirs, "{}\n").unwrap();
        assert!(delete(&theirs, "web-1").is_err(), "not this session's file");
        assert!(theirs.exists());
        assert!(delete(&scratch.0.join("notes.txt"), "web-1").is_err());
        // The pair: its own file goes, and going twice is fine.
        delete(&mine, "web-1").unwrap();
        assert!(!mine.exists());
        assert!(delete(&mine, "web-1").is_ok());
    }

    const NOW: &str = "2026-02-02T00:00:00.000Z";

    fn entries() -> Vec<Value> {
        vec![
            json!({"type": "message", "id": "a", "parentId": null, "message": {"role": "user"}}),
            json!({"type": "message", "id": "b", "parentId": "a", "message": {"role": "assistant"}}),
        ]
    }

    fn lines(path: &Path) -> Vec<String> {
        fs::read_to_string(path)
            .expect("transcript")
            .lines()
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn an_existing_header_survives_byte_for_byte() {
        let scratch = Scratch::new("header");
        let path = scratch.file("s1");
        // Spacing and key order pi chose, which a parse and re-serialise would lose.
        let header = r#"{"type":"session", "version":3,"id":"s1","cwd":"/w","extra":true}"#;
        fs::write(
            &path,
            format!("{header}\n{{\"type\":\"message\",\"id\":\"old\"}}\n"),
        )
        .unwrap();
        rewrite(&path, "s1", "/elsewhere", &entries(), NOW).unwrap();
        let written = lines(&path);
        assert_eq!(written[0], header);
        assert!(
            !written.iter().any(|line| line.contains("\"old\"")),
            "the old entries are gone"
        );
    }

    #[test]
    fn a_missing_file_gets_a_seeded_header_naming_the_session_and_cwd() {
        let scratch = Scratch::new("seed");
        let path = scratch.file("s2");
        rewrite(&path, "s2", "/work/space", &entries(), NOW).unwrap();
        let header: Value = serde_json::from_str(&lines(&path)[0]).unwrap();
        assert_eq!(
            header,
            json!({"type":"session","version":3,"id":"s2","timestamp":NOW,"cwd":"/work/space"})
        );
    }

    #[test]
    fn the_last_line_is_the_last_entry() {
        let scratch = Scratch::new("leaf");
        let path = scratch.file("s3");
        rewrite(&path, "s3", "/w", &entries(), NOW).unwrap();
        let written = lines(&path);
        assert_eq!(written.len(), 3, "header plus one line per entry");
        let leaf: Value = serde_json::from_str(written.last().unwrap()).unwrap();
        assert_eq!(leaf["id"], "b", "pi loads the last line as the leaf");
        assert!(fs::read_to_string(&path).unwrap().ends_with('\n'));
    }

    #[test]
    fn a_file_not_named_for_the_session_is_refused_and_nothing_is_written() {
        let scratch = Scratch::new("name");
        let other = scratch.file("someone-else");
        assert!(rewrite(&other, "s4", "/w", &entries(), NOW).is_err());
        assert!(!other.exists());
        let not_jsonl = scratch.0.join("2026_s4.txt");
        assert!(rewrite(&not_jsonl, "s4", "/w", &entries(), NOW).is_err());
        // The paired case that must still work.
        assert!(rewrite(&scratch.file("s4"), "s4", "/w", &entries(), NOW).is_ok());
    }

    #[test]
    fn a_relative_path_is_refused() {
        let relative = Path::new("2026-01-01T00-00-00-000Z_s5.jsonl");
        assert!(!is_session_file(relative, "s5"));
        assert!(rewrite(relative, "s5", "/w", &entries(), NOW).is_err());
    }

    #[test]
    fn a_session_id_that_could_leave_its_name_is_refused() {
        assert!(is_session_id("welcome"));
        assert!(is_session_id("probe-session-17"));
        assert!(!is_session_id(""));
        assert!(!is_session_id("../x"));
        assert!(!is_session_id("a/b"));
    }

    #[test]
    fn a_failed_write_leaves_the_old_transcript_and_no_temp_file() {
        let scratch = Scratch::new("failed");
        // A directory where the transcript should be: reading it fails, so the
        // rewrite stops before anything is replaced.
        let path = scratch.file("s6");
        fs::create_dir_all(&path).unwrap();
        assert!(rewrite(&path, "s6", "/w", &entries(), NOW).is_err());
        assert!(path.is_dir(), "what was there is untouched");
        let debris = fs::read_dir(&scratch.0)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(debris, 0);
    }
}
