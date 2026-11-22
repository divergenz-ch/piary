//! The app's document store as the running process holds it: where the
//! documents are, and the watcher telling the page when one changed on disk.
//!
//! This is the one place a `DocPaths` is derived from the real environment, so
//! `docs.rs` can stay a function of its arguments and testable without a home
//! directory.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

use crate::docs::{resolve_paths, DocPaths};

/// Where this process reads and writes conversations, and the watcher keeping
/// an eye on them.
pub struct Store {
    pub paths: DocPaths,
    /// The workspace the documents belong to, where pi and a terminal run.
    /// Kept as resolved, never derived back from `paths`: the default document
    /// directory is under the home directory, not in the workspace.
    workspace: PathBuf,
    /// Held only to keep it alive: dropping a `notify` watcher stops the
    /// watch, so a watcher assigned to a local would stop before the first
    /// event arrived.
    watcher: Mutex<Option<RecommendedWatcher>>,
}

impl Store {
    /// Resolves the document directory from this process's environment.
    ///
    /// `PI_CWD` names the workspace, as it does for the bridge; without it the
    /// process's own cwd is the workspace, which is what launching the app from
    /// a repo means.
    pub fn from_env() -> Self {
        let cwd = std::env::var_os("PI_CWD")
            .map(PathBuf::from)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| PathBuf::from("."));
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        let env_doc_dir = std::env::var("PI_DOC_DIR").ok();
        Self::resolve(cwd, &home, env_doc_dir.as_deref())
    }

    /// The store for the workspace `cwd`: its documents where `resolve_paths`
    /// puts them.
    pub fn resolve(cwd: PathBuf, home: &Path, env_doc_dir: Option<&str>) -> Self {
        Self {
            paths: resolve_paths(&cwd, home, env_doc_dir),
            workspace: cwd,
            watcher: Mutex::new(None),
        }
    }

    /// The workspace the documents belong to.
    pub fn workspace(&self) -> &Path {
        &self.workspace
    }

    /// Starts watching the document directory, calling `on_change` with each
    /// changed document's id.
    ///
    /// Non-recursive: documents are flat in the directory, and `attachments/`
    /// below it would otherwise report every upload as a document change.
    /// Watching a directory that does not exist yet is not an error — a fresh
    /// workspace has no documents, and the first write creates it — so the
    /// watch is simply not installed and the page relies on its own writes
    /// until then.
    pub fn watch(&self, on_change: impl Fn(String) + Send + 'static) -> Result<(), String> {
        if !self.paths.doc_dir.is_dir() {
            return Ok(());
        }
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                let Ok(event) = event else { return };
                for path in &event.paths {
                    if let Some(id) = crate::watch::document_id_of(path) {
                        on_change(id);
                    }
                }
            })
            .map_err(|e| format!("starting the document watcher: {e}"))?;
        watcher
            .watch(&self.paths.doc_dir, RecursiveMode::NonRecursive)
            .map_err(|e| format!("watching the document directory: {e}"))?;
        *self.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    /// The watcher against a file this process did not write through the store.
    ///
    /// The app's own probe writes through `docs_write`, which proves the event
    /// reaches the page but not that an outside editor is noticed at all — and
    /// coping with iA Writer or `git checkout` is the entire reason the watcher
    /// exists (ADR 0001: the file is the truth, and anyone may edit it).
    #[test]
    fn an_edit_by_another_writer_is_reported() {
        let dir = std::env::temp_dir().join(format!("piary-watch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch dir");

        let store = Store {
            paths: DocPaths {
                doc_dir: dir.clone(),
            },
            workspace: dir.clone(),
            watcher: Mutex::new(None),
        };
        let (tx, rx) = mpsc::channel();
        store
            .watch(move |id| {
                let _ = tx.send(id);
            })
            .expect("watch");

        // Written with the plain filesystem API rather than `docs::write`, so
        // no part of the store is involved in making the change.
        std::fs::write(dir.join("outside.md"), "# Edited elsewhere\n").expect("external write");

        // FSEvents coalesces, so the id may arrive after a moment and other
        // paths may arrive first; what is asserted is that this one does.
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut seen = false;
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(id) if id == "outside" => {
                    seen = true;
                    break;
                }
                Ok(_) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        let _ = std::fs::remove_dir_all(&dir);
        assert!(
            seen,
            "the watcher never reported the externally written document"
        );
    }

    #[test]
    fn the_workspace_is_the_one_resolved_wherever_the_documents_live() {
        // The default puts documents under the home directory, so the
        // document directory's parent is not the workspace; pi and every
        // terminal must still run in the repo.
        let store = Store::resolve(PathBuf::from("/work/repo"), Path::new("/home"), None);
        assert!(store.paths.doc_dir.starts_with("/home/.pi/agent/docs"));
        assert_eq!(store.workspace(), Path::new("/work/repo"));
        // An explicit document directory elsewhere does not move it either.
        let store = Store::resolve(
            PathBuf::from("/work/repo"),
            Path::new("/home"),
            Some("/elsewhere/docs"),
        );
        assert_eq!(store.workspace(), Path::new("/work/repo"));
        // The pair: a repo's own `pi-docs/` is in the workspace, and the
        // workspace is still the repo.
        let repo = std::env::temp_dir().join(format!("piary-workspace-{}", std::process::id()));
        std::fs::create_dir_all(repo.join("pi-docs")).unwrap();
        let store = Store::resolve(repo.clone(), Path::new("/home"), None);
        assert_eq!(store.paths.doc_dir, repo.join("pi-docs"));
        assert_eq!(store.workspace(), repo.as_path());
        let _ = std::fs::remove_dir_all(&repo);
    }

    #[test]
    fn watching_a_directory_that_does_not_exist_yet_is_not_an_error() {
        // A fresh workspace has no document directory until its first write.
        let store = Store {
            paths: DocPaths {
                doc_dir: std::env::temp_dir().join("piary-absent-watch"),
            },
            workspace: std::env::temp_dir(),
            watcher: Mutex::new(None),
        };
        assert!(store.watch(|_| {}).is_ok());
    }
}
