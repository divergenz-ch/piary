//! The document store: where conversations live on disk, and the only code
//! allowed to resolve a document id into a path.
//!
//! A conversation is one markdown file (ADR 0001) — user-visible, editable in
//! any editor, with machine structure in HTML comments. This module reads and
//! writes them, lists them, and nothing else: it holds no `tauri::` types, so
//! `cargo test` drives it without an app (ADR 0014).
//!
//! **The id guard is the security surface.** Every path reaching the filesystem
//! comes from `path_of`, which refuses anything that could name a file outside
//! the document directory. Each refusal has a paired test asserting the
//! legitimate case still works, so widening a guard cannot be mistaken for
//! loosening it.

use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Where one workspace's documents live.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocPaths {
    pub doc_dir: PathBuf,
}

/// pi's per-cwd session slug, which is also how a workspace's document
/// directory is named under `~/.pi/agent/docs/`.
///
/// Mirrors pi's own `getDefaultSessionDirPath`: the absolute path with its
/// leading separator dropped and every separator and colon turned into a dash,
/// wrapped in double dashes. A divergence here points the app at a directory
/// pi does not use, so this is a port rather than a design.
pub fn cwd_slug(cwd: &Path) -> String {
    let text = cwd.to_string_lossy();
    let trimmed = text.trim_start_matches(['/', '\\']);
    let body: String = trimmed
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':') {
                '-'
            } else {
                c
            }
        })
        .collect();
    format!("--{body}--")
}

/// Resolves where this workspace's documents belong.
///
/// Default: beside pi's transcripts for this cwd, so pointing the app at a
/// foreign repo leaves nothing in it. A repo that wants its conversations
/// committed opts in by having a `pi-docs/` directory in its root.
/// `PI_DOC_DIR` overrides both.
///
/// `home` and `env_doc_dir` are arguments rather than reads of the process
/// environment, which is what lets the tests cover every branch without
/// touching a real home directory.
pub fn resolve_paths(cwd: &Path, home: &Path, env_doc_dir: Option<&str>) -> DocPaths {
    if let Some(dir) = env_doc_dir.filter(|value| !value.is_empty()) {
        return DocPaths {
            doc_dir: PathBuf::from(dir),
        };
    }
    let opt_in = cwd.join("pi-docs");
    if opt_in.is_dir() {
        return DocPaths { doc_dir: opt_in };
    }
    DocPaths {
        doc_dir: home
            .join(".pi")
            .join("agent")
            .join("docs")
            .join(cwd_slug(cwd)),
    }
}

/// Why an id was refused. Carried as a type rather than a string so a caller
/// cannot accidentally match on prose.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BadId {
    Empty,
    /// A separator, a drive letter, or anything else that makes the id name a
    /// location rather than a document.
    NotASingleSegment,
    /// `.`, `..`, or a leading dot: the first two climb, and the third hides a
    /// file from every listing that skips dotfiles.
    DotEntry,
    /// A NUL, a newline, or a control character — none can appear in a real id
    /// and all of them confuse something downstream.
    Control,
}

impl BadId {
    pub fn message(self) -> &'static str {
        match self {
            BadId::Empty => "a document id cannot be empty",
            BadId::NotASingleSegment => "a document id is one path segment, with no separators",
            BadId::DotEntry => "a document id cannot be a dot entry",
            BadId::Control => "a document id cannot contain control characters",
        }
    }
}

/// Checks that `id` names a document and not a location.
///
/// Refused: anything with a separator (`a/b`, `a\b`), an absolute path, a
/// Windows drive prefix, `.` and `..` at any position in the string, a leading
/// dot, and any control character. What survives is a single ordinary filename
/// segment.
///
/// The `..` rule is deliberately about the whole string rather than about path
/// components: by the time a component could be inspected the separators have
/// already been rejected, so a remaining `..` is someone trying their luck with
/// an encoding this code does not decode.
pub fn check_id(id: &str) -> Result<(), BadId> {
    if id.is_empty() {
        return Err(BadId::Empty);
    }
    if id.chars().any(|c| c.is_control()) {
        return Err(BadId::Control);
    }
    if id == "." || id == ".." || id.starts_with('.') {
        return Err(BadId::DotEntry);
    }
    if id.contains('/') || id.contains('\\') || id.contains(':') {
        return Err(BadId::NotASingleSegment);
    }
    Ok(())
}

/// The file one document id names, inside `doc_dir`.
///
/// The only way a path is built in this module. The guard runs first, and then
/// the result is checked to actually live under the directory — belt and
/// braces, because the guard is a statement about the id and this is a
/// statement about the answer.
pub fn path_of(paths: &DocPaths, id: &str) -> Result<PathBuf, String> {
    check_id(id).map_err(|bad| bad.message().to_string())?;
    let candidate = paths.doc_dir.join(format!("{id}.md"));
    // `starts_with` on `Path` compares whole components, so a sibling directory
    // whose NAME merely begins with the doc dir's (`docs-old` against `docs`)
    // is not a match. A string prefix test would accept it, which is the bug
    // this spelling exists to avoid.
    if !candidate.starts_with(&paths.doc_dir) {
        return Err("a document id must stay inside the document directory".into());
    }
    Ok(candidate)
}

/// Reads one document, or `None` when it does not exist yet.
///
/// A missing document is not an error: the app opens a conversation that has
/// never been written, and a file with no markers at all is one pending user
/// message (ADR 0001).
pub fn read(paths: &DocPaths, id: &str) -> Result<Option<String>, String> {
    let path = path_of(paths, id)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("reading {id}: {error}")),
    }
}

/// Writes one document, atomically and durably.
///
/// A temp file in the same directory, then a rename. Truncating in place would
/// leave a half-written conversation on disk if the process died mid-write, and
/// the file is the truth (ADR 0001) — there is no second copy to recover from.
/// The rename is same-directory so it stays within one filesystem, where it is
/// atomic.
///
/// The rename orders the name, not the bytes: without a sync first, power loss
/// can publish a name whose contents were never written. So the temp file is
/// synced before it is renamed, and the directory after, so the rename itself
/// survives too (ADR 0018 §1). `sync_all` is `F_FULLFSYNC` on Apple targets,
/// the call that reaches past the drive's cache; a plain `fsync` there does not.
pub fn write(paths: &DocPaths, id: &str, content: &str) -> Result<(), String> {
    let path = path_of(paths, id)?;
    fs::create_dir_all(&paths.doc_dir)
        .map_err(|e| format!("creating the document directory: {e}"))?;
    write_atomically(&path, content)?;
    // A snapshot that fails must not fail the save it follows.
    let _ = snapshot(paths, id, content, now_ms());
    Ok(())
}

/// At least this long between two snapshots of one document: continuous typing
/// saves far more often than anyone needs a version to go back to.
const SNAPSHOT_GAP_MS: u128 = 60_000;

/// How many snapshots of one document are kept.
const SNAPSHOT_KEEP: usize = 50;

/// Keeps the document as it stands as a version, however recent the last one:
/// what a caller about to replace the whole document with another asks for
/// first, so the replacement can be taken back (ADR 0049). A document that
/// does not exist has nothing to keep.
pub fn keep(paths: &DocPaths, id: &str) -> Result<(), String> {
    let Some(content) = read(paths, id)? else {
        return Ok(());
    };
    snapshot_after(paths, id, &content, now_ms(), 0)
        .map_err(|e| format!("keeping a backup of {id}: {e}"))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis())
}

/// Keeps `content` as a version of the document under `.backups/<id>/`, named
/// by its time in milliseconds. Edits are destructive by design, so this is the
/// only undo that survives a reload (ADR 0018 §3).
fn snapshot(paths: &DocPaths, id: &str, content: &str, now_ms: u128) -> io::Result<()> {
    snapshot_after(paths, id, content, now_ms, SNAPSHOT_GAP_MS)
}

/// `snapshot`, with the least time since the newest version given: zero keeps
/// one regardless.
fn snapshot_after(
    paths: &DocPaths,
    id: &str,
    content: &str,
    now_ms: u128,
    gap_ms: u128,
) -> io::Result<()> {
    let dir = paths.doc_dir.join(".backups").join(id);
    fs::create_dir_all(&dir)?;
    let mut existing: Vec<u128> = fs::read_dir(&dir)?
        .flatten()
        .filter_map(|file| file.path().file_stem()?.to_str()?.parse().ok())
        .collect();
    existing.sort_unstable_by(|a, b| b.cmp(a));
    if existing
        .first()
        .is_some_and(|newest| now_ms.saturating_sub(*newest) < gap_ms)
    {
        return Ok(());
    }
    fs::write(dir.join(format!("{now_ms}.md")), content)?;
    for old in existing.iter().skip(SNAPSHOT_KEEP - 1) {
        fs::remove_file(dir.join(format!("{old}.md")))?;
    }
    Ok(())
}

/// Replaces `path` with `content`, atomically and durably — the sequence
/// `write` describes, for any file that must never be seen half-written.
///
/// The temp file sits beside `path`, so the rename never crosses a filesystem.
/// The caller has made sure `path`'s directory exists.
pub fn write_atomically(path: &Path, content: impl AsRef<[u8]>) -> Result<(), String> {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| format!("{} names no file", path.display()))?;
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    // The pid keeps two processes apart and the counter two writes in this
    // one: a write is off the main thread, so two of the same file can
    // overlap, and a shared temp name lets one truncate the other's.
    let temp = dir.join(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    let written = write_synced(&temp, content.as_ref()).map_err(|e| format!("writing {name}: {e}"));
    let published = written
        .and_then(|()| fs::rename(&temp, path).map_err(|e| format!("replacing {name}: {e}")));
    if published.is_err() {
        // The temp file must not outlive a failed write, or the directory
        // collects debris that every listing then has to know to skip.
        let _ = fs::remove_file(&temp);
        return published;
    }
    // A directory that refuses a sync is not a failed save: the contents are
    // durable and the rename has happened; only its order against a power cut
    // is unguaranteed on that filesystem (ADR 0018 §1).
    let _ = File::open(dir).and_then(|dir| dir.sync_all());
    Ok(())
}

/// Distinguishes this process's concurrent temp files from one another.
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

/// Creates `path` holding `content`, synced to the device before it is closed.
fn write_synced(path: &Path, content: &[u8]) -> io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(content)?;
    file.sync_all()
}

/// One document as the conversation list shows it: its id, and when its file
/// last changed, in milliseconds since the Unix epoch.
#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub id: String,
    pub modified_ms: f64,
}

/// Every document with when it last changed, most recent first; ties by id.
pub fn entries(paths: &DocPaths) -> Result<Vec<Entry>, String> {
    let mut listed: Vec<Entry> = list(paths)?
        .into_iter()
        .filter_map(|id| {
            let modified = fs::metadata(path_of(paths, &id).ok()?)
                .ok()?
                .modified()
                .ok()?;
            let since = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
            Some(Entry {
                id,
                modified_ms: since.as_secs_f64() * 1000.0,
            })
        })
        .collect();
    listed.sort_by(|a, b| {
        b.modified_ms
            .total_cmp(&a.modified_ms)
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(listed)
}

/// Removes one document. One that is not there is already removed.
pub fn delete(paths: &DocPaths, id: &str) -> Result<(), String> {
    match fs::remove_file(path_of(paths, id)?) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => {
            Err(format!("deleting {id}: {error}"))
        }
        _ => Ok(()),
    }
}

/// Every document in the directory, by id, sorted.
///
/// Sorted because the order reaches a user-visible list, and a directory's own
/// order is whatever the filesystem happens to return. Dotfiles are skipped:
/// `check_id` refuses to create one, so anything matching is not ours.
pub fn list(paths: &DocPaths) -> Result<Vec<String>, String> {
    let entries = match fs::read_dir(&paths.doc_dir) {
        Ok(entries) => entries,
        // A workspace with no documents yet is empty, not broken.
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("listing documents: {error}")),
    };
    let mut ids: Vec<String> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension() == Some(OsStr::new("md")))
        .filter_map(|path| {
            path.file_stem()
                .map(|stem| stem.to_string_lossy().into_owned())
        })
        .filter(|id| check_id(id).is_ok())
        .collect();
    ids.sort();
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A document directory under the OS temp dir, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("piary-docs-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
        fn paths(&self) -> DocPaths {
            DocPaths {
                doc_dir: self.0.clone(),
            }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    // ---- rolling snapshots

    /// The times of a document's snapshots, oldest first.
    fn snapshots(scratch: &Scratch, id: &str) -> Vec<u128> {
        let dir = scratch.0.join(".backups").join(id);
        let mut times: Vec<u128> = fs::read_dir(dir)
            .map(|files| {
                files
                    .flatten()
                    .filter_map(|file| file.path().file_stem()?.to_str()?.parse().ok())
                    .collect()
            })
            .unwrap_or_default();
        times.sort_unstable();
        times
    }

    #[test]
    fn a_save_keeps_a_snapshot_of_what_it_wrote() {
        let scratch = Scratch::new("snapshot-save");
        write(&scratch.paths(), "doc", "first").unwrap();
        let times = snapshots(&scratch, "doc");
        assert_eq!(times.len(), 1);
        let kept = scratch.0.join(format!(".backups/doc/{}.md", times[0]));
        assert_eq!(fs::read_to_string(kept).unwrap(), "first");
    }

    #[test]
    fn a_document_about_to_be_replaced_is_kept_however_recent_the_last_version() {
        let scratch = Scratch::new("snapshot-keep");
        let paths = scratch.paths();
        write(&paths, "doc", "first").unwrap();
        // Inside the minute, so the save itself keeps no version of this.
        write(&paths, "doc", "second").unwrap();
        keep(&paths, "doc").unwrap();
        let newest = *snapshots(&scratch, "doc").last().unwrap();
        let kept = scratch.0.join(format!(".backups/doc/{newest}.md"));
        assert_eq!(fs::read_to_string(kept).unwrap(), "second");
        // Nothing to keep is not a failure.
        keep(&paths, "never-written").unwrap();
        assert!(snapshots(&scratch, "never-written").is_empty());
    }

    #[test]
    fn snapshots_of_one_document_are_at_least_a_minute_apart() {
        let scratch = Scratch::new("snapshot-gap");
        let paths = scratch.paths();
        snapshot(&paths, "doc", "a", 1_000_000).unwrap();
        snapshot(&paths, "doc", "b", 1_059_999).unwrap();
        assert_eq!(snapshots(&scratch, "doc"), [1_000_000]);
        snapshot(&paths, "doc", "c", 1_060_000).unwrap();
        assert_eq!(snapshots(&scratch, "doc"), [1_000_000, 1_060_000]);
    }

    #[test]
    fn the_gap_is_per_document() {
        let scratch = Scratch::new("snapshot-per-doc");
        let paths = scratch.paths();
        snapshot(&paths, "one", "a", 1_000_000).unwrap();
        snapshot(&paths, "two", "b", 1_000_001).unwrap();
        assert_eq!(snapshots(&scratch, "two"), [1_000_001]);
    }

    #[test]
    fn only_the_newest_fifty_snapshots_are_kept() {
        let scratch = Scratch::new("snapshot-keep");
        let paths = scratch.paths();
        let minute = 60_000u128;
        for n in 1..=52 {
            snapshot(&paths, "doc", "x", n * minute).unwrap();
        }
        let expected: Vec<u128> = (3..=52).map(|n| n * minute).collect();
        assert_eq!(snapshots(&scratch, "doc"), expected);
    }

    #[test]
    fn snapshots_are_not_listed_as_conversations() {
        let scratch = Scratch::new("snapshot-list");
        write(&scratch.paths(), "doc", "first").unwrap();
        assert_eq!(list(&scratch.paths()).unwrap(), ["doc"]);
    }

    // ---- the id guard, each refusal paired with the case that must still work

    #[test]
    fn a_plain_id_is_accepted() {
        assert!(check_id("abc123").is_ok());
        assert!(check_id("web-landing").is_ok());
        assert!(
            check_id("a_b.c").is_ok(),
            "a dot inside the name is ordinary"
        );
    }

    #[test]
    fn an_empty_id_is_refused() {
        assert_eq!(check_id(""), Err(BadId::Empty));
    }

    #[test]
    fn a_separator_is_refused_but_a_dash_is_not() {
        assert_eq!(check_id("a/b"), Err(BadId::NotASingleSegment));
        assert_eq!(check_id("a\\b"), Err(BadId::NotASingleSegment));
        assert_eq!(check_id("/etc/passwd"), Err(BadId::NotASingleSegment));
        assert_eq!(check_id("C:file"), Err(BadId::NotASingleSegment));
        // The pair: what a separator rule must not start rejecting.
        assert!(check_id("a-b").is_ok());
    }

    #[test]
    fn climbing_is_refused_at_any_depth() {
        assert_eq!(check_id(".."), Err(BadId::DotEntry));
        assert_eq!(check_id("../../etc/passwd"), Err(BadId::DotEntry));
        // Not a dot entry, but still not one segment.
        assert_eq!(check_id("a/../b"), Err(BadId::NotASingleSegment));
    }

    #[test]
    fn a_dot_entry_is_refused_but_a_dotted_name_is_not() {
        assert_eq!(check_id("."), Err(BadId::DotEntry));
        assert_eq!(check_id(".hidden"), Err(BadId::DotEntry));
        // The pair: a dot that is not leading is part of the name.
        assert!(check_id("notes.v2").is_ok());
    }

    #[test]
    fn control_characters_are_refused() {
        assert_eq!(check_id("a\0b"), Err(BadId::Control));
        assert_eq!(check_id("a\nb"), Err(BadId::Control));
        assert!(check_id("ab").is_ok());
    }

    #[test]
    fn a_sibling_directory_that_merely_prefixes_the_root_is_not_inside_it() {
        // The trap this test exists for: `docs-old` begins with `docs` as a
        // STRING but is not under it as a PATH. `path_of` compares components,
        // so the guard cannot be fooled by the name — and the paired assertion
        // proves a real document in `docs` still resolves.
        let paths = DocPaths {
            doc_dir: PathBuf::from("/tmp/docs"),
        };
        let inside = path_of(&paths, "note").expect("a plain id resolves");
        assert_eq!(inside, PathBuf::from("/tmp/docs/note.md"));
        assert!(!inside.starts_with("/tmp/docs-old"));
    }

    #[test]
    fn every_filesystem_entry_point_runs_the_guard() {
        // One test per door, so adding a door without the guard fails here
        // rather than at a pen test.
        let scratch = Scratch::new("guarded");
        let paths = scratch.paths();
        assert!(read(&paths, "../escape").is_err());
        assert!(write(&paths, "../escape", "x").is_err());
        assert!(path_of(&paths, "../escape").is_err());
        // The pair: the same three calls work on a legitimate id.
        assert!(write(&paths, "fine", "x").is_ok());
        assert_eq!(read(&paths, "fine").unwrap().as_deref(), Some("x"));
    }

    // ---- reading, writing, listing
    //
    // What these assert is what a process can observe: the content is whole,
    // the temp file is gone, overlapping writers each publish one version.
    // That a write survives power loss is not among it — a crash cannot be
    // produced in-process, so the syncs are held by ADR 0018's reasoning and by
    // the calls being made, and by no test here.

    #[test]
    fn a_document_round_trips() {
        let scratch = Scratch::new("roundtrip");
        let paths = scratch.paths();
        let body = "# Title\n\nProse.\n";
        write(&paths, "doc", body).expect("write");
        assert_eq!(read(&paths, "doc").unwrap().as_deref(), Some(body));
    }

    #[test]
    fn a_missing_document_reads_as_none_rather_than_an_error() {
        // The app opens a conversation that has never been written; a file with
        // no markers is one pending user message (ADR 0001).
        let scratch = Scratch::new("missing");
        assert_eq!(read(&scratch.paths(), "never-written").unwrap(), None);
    }

    #[test]
    fn a_write_leaves_no_temp_file_behind() {
        let scratch = Scratch::new("notemp");
        let paths = scratch.paths();
        write(&paths, "doc", "body").expect("write");
        let leftovers: Vec<_> = fs::read_dir(&paths.doc_dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp files left: {leftovers:?}");
    }

    #[test]
    fn a_rewrite_replaces_rather_than_appends() {
        let scratch = Scratch::new("rewrite");
        let paths = scratch.paths();
        write(&paths, "doc", "first and much longer").expect("first");
        write(&paths, "doc", "second").expect("second");
        assert_eq!(read(&paths, "doc").unwrap().as_deref(), Some("second"));
    }

    #[test]
    fn writers_racing_on_one_document_each_publish_a_whole_version() {
        // `docs_write` runs off the main thread, so two writes of one document
        // can overlap in this process. Each must publish its own complete
        // content or nothing — never fail because the other took its temp
        // file, and never publish a mix of the two.
        let scratch = Scratch::new("racing");
        let paths = scratch.paths();
        let versions: Vec<String> = (0..RACERS)
            .map(|n| format!("version {n}\n").repeat(VERSION_LINES))
            .collect();
        let failures: Vec<String> = std::thread::scope(|scope| {
            let handles: Vec<_> = versions
                .iter()
                .map(|version| {
                    let paths = &paths;
                    scope.spawn(move || {
                        (0..ROUNDS)
                            .filter_map(|_| write(paths, "doc", version).err())
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            handles
                .into_iter()
                .flat_map(|handle| handle.join().unwrap())
                .collect()
        });
        assert!(
            failures.is_empty(),
            "{} of {} writes failed, first: {:?}",
            failures.len(),
            RACERS * ROUNDS,
            failures.first()
        );
        let published = read(&paths, "doc")
            .unwrap()
            .expect("a version was published");
        assert!(
            versions.contains(&published),
            "the published file is no single writer's content"
        );
    }

    /// Enough writers, rounds and bytes that two writes overlap on every run:
    /// a version takes long enough to write that another starts meanwhile.
    const RACERS: usize = 4;
    const ROUNDS: usize = 25;
    const VERSION_LINES: usize = 20_000;

    #[test]
    fn writing_creates_the_directory() {
        // The first conversation in a fresh workspace has nowhere to go yet.
        let scratch = Scratch::new("mkdir");
        let nested = DocPaths {
            doc_dir: scratch.0.join("deeper"),
        };
        write(&nested, "doc", "body").expect("write into a missing directory");
        assert_eq!(read(&nested, "doc").unwrap().as_deref(), Some("body"));
    }

    #[test]
    fn entries_are_most_recent_first() {
        let scratch = Scratch::new("entries");
        let paths = scratch.paths();
        write(&paths, "older", "o").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        write(&paths, "newer", "n").unwrap();
        let listed = entries(&paths).unwrap();
        assert_eq!(
            listed.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
            vec!["newer", "older"]
        );
        assert!(listed[0].modified_ms >= listed[1].modified_ms);
        assert!(
            listed[0].modified_ms > 1_600_000_000_000.0,
            "milliseconds since the epoch"
        );
    }

    #[test]
    fn entries_skip_what_the_listing_skips() {
        let scratch = Scratch::new("entries-filtered");
        let paths = scratch.paths();
        write(&paths, "real", "r").unwrap();
        fs::write(paths.doc_dir.join(".hidden.md"), "x").unwrap();
        fs::write(paths.doc_dir.join("notes.txt"), "x").unwrap();
        assert_eq!(entries(&paths).unwrap().len(), 1);
        let missing = DocPaths {
            doc_dir: scratch.0.join("nope"),
        };
        assert!(entries(&missing).unwrap().is_empty());
    }

    #[test]
    fn a_deleted_document_is_gone_and_its_neighbours_stay() {
        let scratch = Scratch::new("delete");
        let paths = scratch.paths();
        write(&paths, "doomed", "d").unwrap();
        write(&paths, "kept", "k").unwrap();
        delete(&paths, "doomed").unwrap();
        assert_eq!(read(&paths, "doomed").unwrap(), None);
        assert_eq!(read(&paths, "kept").unwrap().as_deref(), Some("k"));
        assert!(
            delete(&paths, "doomed").is_ok(),
            "already gone is not an error"
        );
    }

    #[test]
    fn delete_runs_the_guard() {
        let scratch = Scratch::new("delete-guard");
        let paths = scratch.paths();
        fs::write(scratch.0.join("..").join("escape.md"), "x").ok();
        assert!(delete(&paths, "../escape").is_err());
    }

    #[test]
    fn listing_returns_sorted_ids_without_extensions() {
        let scratch = Scratch::new("listing");
        let paths = scratch.paths();
        write(&paths, "zeta", "z").unwrap();
        write(&paths, "alpha", "a").unwrap();
        assert_eq!(list(&paths).unwrap(), vec!["alpha", "zeta"]);
    }

    #[test]
    fn listing_ignores_what_is_not_a_document() {
        let scratch = Scratch::new("filtered");
        let paths = scratch.paths();
        write(&paths, "real", "r").unwrap();
        fs::write(paths.doc_dir.join("notes.txt"), "not markdown").unwrap();
        fs::write(paths.doc_dir.join(".hidden.md"), "a dotfile").unwrap();
        fs::create_dir(paths.doc_dir.join("attachments")).unwrap();
        assert_eq!(list(&paths).unwrap(), vec!["real"]);
    }

    #[test]
    fn listing_an_absent_directory_is_empty_rather_than_an_error() {
        let scratch = Scratch::new("absent");
        let missing = DocPaths {
            doc_dir: scratch.0.join("nope"),
        };
        assert_eq!(list(&missing).unwrap(), Vec::<String>::new());
    }

    // ---- where the documents live

    #[test]
    fn the_slug_matches_pis_own_shape() {
        assert_eq!(cwd_slug(Path::new("/Users/me/repo")), "--Users-me-repo--");
    }

    #[test]
    fn pi_doc_dir_wins_over_everything() {
        let paths = resolve_paths(Path::new("/w"), Path::new("/home"), Some("/explicit"));
        assert_eq!(paths.doc_dir, PathBuf::from("/explicit"));
    }

    #[test]
    fn an_empty_env_override_is_not_an_override() {
        // An unset variable arrives as an empty string often enough that
        // treating it as a path would put documents in the process's cwd.
        let paths = resolve_paths(Path::new("/w"), Path::new("/home"), Some(""));
        assert_eq!(paths.doc_dir, PathBuf::from("/home/.pi/agent/docs/--w--"));
    }

    #[test]
    fn a_repo_with_pi_docs_keeps_its_conversations() {
        let scratch = Scratch::new("optin");
        fs::create_dir_all(scratch.0.join("pi-docs")).unwrap();
        let paths = resolve_paths(&scratch.0, Path::new("/home"), None);
        assert_eq!(paths.doc_dir, scratch.0.join("pi-docs"));
    }

    #[test]
    fn a_foreign_repo_is_left_untouched() {
        // The default deliberately writes nothing into a repo that did not opt
        // in, so pointing the app at someone else's checkout leaves no trace.
        let scratch = Scratch::new("foreign");
        let paths = resolve_paths(&scratch.0, Path::new("/home"), None);
        assert!(paths.doc_dir.starts_with("/home/.pi/agent/docs"));
    }
}
