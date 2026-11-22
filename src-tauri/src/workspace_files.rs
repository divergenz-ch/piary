//! The workspace's files, read-only, for the document's cells: what a cell's
//! `FileAttachment("sales.csv")` fetches (`docs/notebook-cells.md` §Files).
//!
//! A cell reads its data from the file rather than from numbers the agent typed
//! into its source, so the chart is the file's and follows it when it changes.
//!
//! **The path guard is the security surface,** as the name guard is in
//! `attachments.rs`: a request names a path under the workspace and nothing
//! else. A `..` step, a hidden file or directory (`.env`, `.git/`), and a
//! symlink that leads out of the workspace are all refused the same way a
//! missing file is, so a refusal says nothing about what exists outside. Each
//! refusal has a paired test beside the case that still works.
//!
//! A workspace that is the filesystem root or the home directory serves
//! nothing: that is what a launch from Finder without `PI_CWD` resolves to, and
//! there "the workspace" would be every file the account can read. Cells run
//! when a document opens, and a cell can reach the network, so the scheme is as
//! wide as the workspace a document is opened in, and no wider.
//!
//! No `tauri::` types (ADR 0014).

use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::attachments::{decode_filename, Served};

/// The largest file served: 50 MiB. A cell holds what it reads in memory, and a
/// file past this is not data a chart in a document is drawn from.
const MAX_BYTES: u64 = 50 * 1024 * 1024;

/// The type a file is served as, by its extension. Anything else is bytes:
/// `.text()` and `.arrayBuffer()` read it either way.
fn mime(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    match ext.as_str() {
        "csv" => "text/csv; charset=utf-8",
        "tsv" => "text/tab-separated-values; charset=utf-8",
        "json" => "application/json",
        // HTML is served as text: the page asked for data, not a document to render.
        "txt" | "md" | "log" | "html" => "text/plain; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

/// The file `uri_path` names under `workspace`, or `None` for anything the
/// guard refuses. The request path is percent-decoded once, then every step of
/// it must be a plain name: no `..`, no root or prefix, nothing hidden. The
/// joined path is resolved through its symlinks and must still be inside the
/// resolved workspace, which must be neither `/` nor `home`.
pub fn path_of(workspace: &Path, home: &Path, uri_path: &str) -> Option<PathBuf> {
    let decoded = decode_filename(uri_path.trim_start_matches('/'));
    let relative = Path::new(&decoded);
    let mut steps = 0;
    for component in relative.components() {
        match component {
            Component::Normal(name) if !name.to_string_lossy().starts_with('.') => steps += 1,
            _ => return None,
        }
    }
    if steps == 0 {
        return None;
    }
    let root = fs::canonicalize(workspace).ok()?;
    if root.parent().is_none() || fs::canonicalize(home).ok().as_deref() == Some(root.as_path()) {
        return None;
    }
    let file = fs::canonicalize(root.join(relative)).ok()?;
    (file.starts_with(&root) && file.is_file()).then_some(file)
}

/// Answers `piary-workspace://localhost/<path>`: the file's bytes, typed by its
/// extension, never cached (the file is the user's and changes), and 404 for
/// anything `path_of` refuses or a file too large to serve.
pub fn serve(workspace: &Path, home: &Path, uri_path: &str) -> Served {
    let not_found = || Served {
        status: 404,
        headers: cors(),
        body: Vec::new(),
    };
    let Some(path) = path_of(workspace, home, uri_path) else {
        return not_found();
    };
    match fs::metadata(&path) {
        Ok(meta) if meta.len() <= MAX_BYTES => {}
        _ => return not_found(),
    }
    let Ok(body) = fs::read(&path) else {
        return not_found();
    };
    let mut headers = cors();
    headers.push(("Content-Type", mime(&path).to_string()));
    headers.push(("X-Content-Type-Options", "nosniff".to_string()));
    headers.push(("Cache-Control", "no-store".to_string()));
    Served {
        status: 200,
        headers,
        body,
    }
}

/// A cell fetches from the page's own origin, which is not this scheme's, so
/// the answer must allow it or `fetch` rejects with no body. Only this app's
/// webview can reach the scheme at all.
fn cors() -> Vec<(&'static str, String)> {
    vec![("Access-Control-Allow-Origin", "*".to_string())]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch workspace with a data file, a nested one, a hidden one, and a
    /// file outside it that a symlink inside points at.
    fn workspace(tag: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("piary-ws-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let ws = base.join("ws");
        fs::create_dir_all(ws.join("data")).unwrap();
        fs::create_dir_all(ws.join(".git")).unwrap();
        fs::write(ws.join("sales.csv"), "month,revenue\nJan,1\n").unwrap();
        fs::write(ws.join("data/q 1.json"), "[1]").unwrap();
        fs::write(ws.join(".env"), "SECRET=1").unwrap();
        fs::write(ws.join(".git/config"), "[core]").unwrap();
        fs::write(base.join("outside.txt"), "outside").unwrap();
        std::os::unix::fs::symlink(base.join("outside.txt"), ws.join("link.txt")).unwrap();
        fs::write(ws.join("real.txt"), "inside").unwrap();
        std::os::unix::fs::symlink(ws.join("real.txt"), ws.join("alias.txt")).unwrap();
        (base, ws)
    }

    #[test]
    fn a_workspace_file_is_served_with_its_type() {
        let (_base, ws) = workspace("serve");
        let served = serve(&ws, Path::new("/nonexistent-home"), "/sales.csv");
        assert_eq!(served.status, 200);
        assert_eq!(served.body, b"month,revenue\nJan,1\n");
        assert!(served
            .headers
            .contains(&("Content-Type", "text/csv; charset=utf-8".to_string())));
        assert!(served
            .headers
            .contains(&("Cache-Control", "no-store".to_string())));
    }

    #[test]
    fn a_nested_path_with_an_encoded_space_is_served() {
        let (_base, ws) = workspace("nested");
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/data/q%201.json").body,
            b"[1]"
        );
    }

    #[test]
    fn a_step_up_out_of_the_workspace_is_refused() {
        let (_base, ws) = workspace("dotdot");
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/../outside.txt").status,
            404
        );
        assert_eq!(
            serve(
                &ws,
                Path::new("/nonexistent-home"),
                "/data/..%2F..%2Foutside.txt"
            )
            .status,
            404
        );
        // The legitimate neighbour of the refusal.
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/data/q%201.json").status,
            200
        );
    }

    #[test]
    fn a_hidden_file_or_directory_is_refused() {
        let (_base, ws) = workspace("hidden");
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/.env").status,
            404
        );
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/.git/config").status,
            404
        );
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/sales.csv").status,
            200
        );
    }

    #[test]
    fn a_symlink_out_of_the_workspace_is_refused_and_one_inside_is_served() {
        let (_base, ws) = workspace("symlink");
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/link.txt").status,
            404
        );
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/alias.txt").body,
            b"inside"
        );
    }

    #[test]
    fn a_workspace_at_the_root_or_the_home_directory_serves_nothing() {
        let (base, ws) = workspace("wide");
        assert_eq!(
            serve(Path::new("/"), Path::new("/nonexistent-home"), "/etc/hosts").status,
            404
        );
        assert_eq!(serve(&ws, &ws, "/sales.csv").status, 404);
        // The same workspace under another home is served.
        assert_eq!(serve(&ws, &base, "/sales.csv").status, 200);
    }

    #[test]
    fn a_missing_file_or_a_directory_is_refused_like_any_other() {
        let (_base, ws) = workspace("missing");
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/nope.csv").status,
            404
        );
        assert_eq!(
            serve(&ws, Path::new("/nonexistent-home"), "/data").status,
            404
        );
        assert_eq!(serve(&ws, Path::new("/nonexistent-home"), "/").status, 404);
    }
}
