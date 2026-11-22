//! A conversation leaving the store or entering it (ADR 0049).
//!
//! A bundle is the document beside the attachments it references:
//!
//! ```text
//! <name>/
//!   <name>.md
//!   attachments/
//! ```
//!
//! and a zip bundle is that folder zipped, the folder its one top-level entry.
//! Which attachments a document references is the page's to say (it holds the
//! format); this module takes the names and does the file work.
//!
//! **What is read here came from somewhere else.** A folder or an archive is
//! taken apart by rule, never copied wholesale: one regular `.md` at the top,
//! regular files directly under `attachments/` whose names the attachment
//! store's own guard accepts, and nothing reached through a symlink. An
//! archive is never extracted as it says: its entries are checked whole first,
//! and then only the entries at those two places are written, by this module,
//! under names it chose.
//!
//! No `tauri::` types (ADR 0014).

use crate::attachments;
use crate::docs::{self, DocPaths};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// The folder inside a bundle that holds its attachments.
const ATTACHMENTS: &str = "attachments";

/// Said when a folder or an archive is not a bundle.
const LAYOUT: &str =
    "a bundle is one folder holding one .md file and, beside it, an attachments folder";

/// A directory under the OS temp dir that is removed when its owner is done.
#[derive(Debug)]
struct Scratch(PathBuf);

static NEXT_SCRATCH: AtomicU64 = AtomicU64::new(0);

impl Scratch {
    /// A new, empty one. Created rather than adopted: a directory already
    /// there under the name is somebody else's.
    fn new() -> Result<Self, String> {
        let dir = std::env::temp_dir().join(format!(
            "piary-bundle-{}-{}",
            std::process::id(),
            NEXT_SCRATCH.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir(&dir).map_err(|e| format!("making a working directory: {e}"))?;
        Ok(Self(dir))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

// ---- export

/// The things a conversation is exported as. The first three are the document
/// itself (ADR 0049); the last two are what the page drew of it, for a reader
/// without Piary (ADR 0066).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Markdown,
    Folder,
    Zip,
    Html,
    Pdf,
}

impl Kind {
    /// The kind the page names, or why it names none.
    pub fn named(name: &str) -> Result<Self, String> {
        match name {
            "markdown" => Ok(Kind::Markdown),
            "folder" => Ok(Kind::Folder),
            "zip" => Ok(Kind::Zip),
            "html" => Ok(Kind::Html),
            "pdf" => Ok(Kind::Pdf),
            other => Err(format!("{other:?} is not a kind of export")),
        }
    }

    /// What the conversation `id` is called in the folder it is exported into.
    fn name_of(self, id: &str) -> String {
        match self {
            Kind::Markdown => format!("{id}.md"),
            Kind::Folder => id.to_string(),
            Kind::Zip => format!("{id}.zip"),
            Kind::Html => format!("{id}.html"),
            Kind::Pdf => format!("{id}.pdf"),
        }
    }
}

/// The folder the last export went into, by the token the page holds for it.
///
/// A PDF is printed from the page one conversation at a time, so an export of
/// several is several commands, and the panel is shown for the first alone:
/// the others name the folder by this token. The page never names a path
/// (ADR 0049).
#[derive(Debug, Default)]
pub struct Exports {
    held: Mutex<Option<(String, PathBuf)>>,
    next: AtomicU64,
}

impl Exports {
    /// Holds `folder` in place of the one held, and answers with its token.
    pub fn hold(&self, folder: PathBuf) -> String {
        let token = format!("export-{}", self.next.fetch_add(1, Ordering::Relaxed));
        *self.lock() = Some((token.clone(), folder));
        token
    }

    /// The folder `token` names, if it is the one still held.
    pub fn get(&self, token: &str) -> Result<PathBuf, String> {
        match &*self.lock() {
            Some((held, folder)) if held == token => Ok(folder.clone()),
            _ => Err("that export's folder is no longer held; export again".to_string()),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<(String, PathBuf)>> {
        self.held
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// A file a page is printed to, read back and removed.
#[derive(Debug)]
pub struct Printed(Scratch);

impl Printed {
    pub fn new() -> Result<Self, String> {
        Scratch::new().map(Self)
    }

    /// Where the print goes.
    pub fn path(&self) -> PathBuf {
        self.0 .0.join("page.pdf")
    }

    /// What was printed.
    pub fn read(&self) -> Result<Vec<u8>, String> {
        fs::read(self.path()).map_err(|e| format!("the page was not printed: {e}"))
    }
}

/// Writes the conversation `id` into the folder `into`, under its own name,
/// and answers with that name and the attachments the store does not hold.
///
/// A name the folder already has is never written over: several conversations
/// leave in one export, and no panel asked about each.
///
/// `drawn` is the file a drawn kind is written as: the page made it, or the
/// page was printed to it. The other kinds are read from the store.
pub fn export_into(
    paths: &DocPaths,
    id: &str,
    kind: Kind,
    names: &[String],
    drawn: Option<&[u8]>,
    into: &Path,
) -> Result<(String, Vec<String>), String> {
    docs::check_id(id).map_err(|bad| bad.message().to_string())?;
    let name = kind.name_of(id);
    let dest = into.join(&name);
    if fs::symlink_metadata(&dest).is_ok() {
        return Err(format!("{name} is already there, and was left as it is"));
    }
    let missing = match kind {
        Kind::Markdown => export_markdown(paths, id, &dest).map(|()| Vec::new()),
        Kind::Folder => export_folder(paths, id, names, &dest),
        Kind::Zip => export_zip(paths, id, names, &dest),
        Kind::Html | Kind::Pdf => {
            let drawn = drawn.ok_or_else(|| format!("nothing was drawn of {id}"))?;
            docs::write_atomically(&dest, drawn).map(|()| Vec::new())
        }
    }?;
    Ok((name, missing))
}

/// Writes the document `id` to `dest`, a file.
fn export_markdown(paths: &DocPaths, id: &str, dest: &Path) -> Result<(), String> {
    docs::write_atomically(dest, stored(paths, id)?)
}

fn stored(paths: &DocPaths, id: &str) -> Result<String, String> {
    docs::read(paths, id)?.ok_or_else(|| format!("{id} has not been saved yet"))
}

/// Writes the document `id` and the attachments named to `dest` as a folder
/// bundle, and answers with the names the store does not hold.
///
/// `dest` is made, or is an empty directory already: a bundle is never mixed
/// into files that were there.
fn export_folder(
    paths: &DocPaths,
    id: &str,
    names: &[String],
    dest: &Path,
) -> Result<Vec<String>, String> {
    let content = stored(paths, id)?;
    match fs::read_dir(dest) {
        Ok(mut entries) => {
            if entries.next().is_some() {
                return Err(format!(
                    "{} already holds files; export into a new or an empty folder",
                    dest.display()
                ));
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(dest).map_err(|e| format!("making {}: {e}", dest.display()))?;
        }
        Err(e) => return Err(format!("reading {}: {e}", dest.display())),
    }
    docs::write_atomically(&dest.join(format!("{id}.md")), content)?;

    let store = attachments::dir(paths);
    let out = dest.join(ATTACHMENTS);
    let mut missing = Vec::new();
    for name in names {
        // A name the guard refuses names no stored file, so it is missing
        // rather than an error: the document may link to anything.
        let source = attachments::path_of(&store, name).ok();
        let Some(bytes) = source.and_then(|path| fs::read(path).ok()) else {
            missing.push(name.clone());
            continue;
        };
        fs::create_dir_all(&out).map_err(|e| format!("making {}: {e}", out.display()))?;
        docs::write_atomically(&out.join(name), bytes)?;
    }
    Ok(missing)
}

/// Writes the same bundle as one zip file at `dest`, the folder its one
/// top-level entry.
fn export_zip(
    paths: &DocPaths,
    id: &str,
    names: &[String],
    dest: &Path,
) -> Result<Vec<String>, String> {
    let scratch = Scratch::new()?;
    let folder = scratch.0.join(id);
    let missing = export_folder(paths, id, names, &folder)?;
    let zipped = zip_folder(id, &folder).map_err(|e| format!("zipping {id}: {e}"))?;
    docs::write_atomically(dest, zipped)?;
    Ok(missing)
}

/// A folder bundle as the bytes of an archive, under `root/`.
fn zip_folder(root: &str, folder: &Path) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    archive.add_directory(format!("{root}/"), options)?;
    let mut add = |entry: String, path: &Path| -> Result<(), Box<dyn std::error::Error>> {
        archive.start_file(entry, options)?;
        archive.write_all(&fs::read(path)?)?;
        Ok(())
    };
    for path in visible(folder)? {
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if is_plain_file(&path) {
            add(format!("{root}/{name}"), &path)?;
        }
    }
    let carried = folder.join(ATTACHMENTS);
    if is_plain_dir(&carried) {
        for path in visible(&carried)? {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            add(format!("{root}/{ATTACHMENTS}/{name}"), &path)?;
        }
    }
    Ok(archive.finish()?.into_inner())
}

// ---- import

/// An import that has been read and not yet placed in the store.
#[derive(Debug)]
pub struct Staged {
    /// The `.md` file's name without its extension: the id it asks for.
    pub name: String,
    pub content: String,
    /// The attachments it carries, by name, and where each is read from.
    files: BTreeMap<String, PathBuf>,
    /// Where an archive was extracted, kept for as long as `files` point in.
    _scratch: Option<Scratch>,
}

impl Staged {
    /// The names of the attachments carried.
    pub fn attachments(&self) -> Vec<String> {
        self.files.keys().cloned().collect()
    }
}

/// Reads one markdown file as an import that carries no attachments.
pub fn stage_markdown(file: &Path) -> Result<Staged, String> {
    let name = file
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| format!("{} has no name to import under", file.display()))?;
    let content =
        fs::read_to_string(file).map_err(|e| format!("reading {}: {e}", file.display()))?;
    Ok(Staged {
        name: name.into(),
        content,
        files: BTreeMap::new(),
        _scratch: None,
    })
}

/// Whether `path` is a file itself, not a link to one.
fn is_plain_file(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.is_file())
}

/// Whether `path` is a directory itself, not a link to one.
fn is_plain_dir(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.is_dir())
}

/// The entries of `dir` that are not dotfiles, which no bundle is made of and
/// Finder leaves everywhere.
fn visible(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("reading {}: {e}", dir.display()))?;
    Ok(entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| !name.starts_with('.'))
        })
        .collect())
}

/// Reads a folder bundle.
pub fn stage_folder(dir: &Path) -> Result<Staged, String> {
    let documents: Vec<PathBuf> = visible(dir)?
        .into_iter()
        .filter(|path| path.extension().is_some_and(|ext| ext == "md") && is_plain_file(path))
        .collect();
    let [document] = documents.as_slice() else {
        return Err(format!(
            "{} holds {} .md files; {LAYOUT}",
            dir.display(),
            documents.len()
        ));
    };
    let mut staged = stage_markdown(document)?;
    let carried = dir.join(ATTACHMENTS);
    if is_plain_dir(&carried) {
        for path in visible(&carried)? {
            let name = path.file_name().and_then(|name| name.to_str());
            let Some(name) = name.filter(|_| is_plain_file(&path)) else {
                continue;
            };
            if attachments::path_of(&carried, name).is_ok() {
                staged.files.insert(name.into(), path);
            }
        }
    }
    Ok(staged)
}

/// Whether an archive entry is Finder's bookkeeping, which its own zips carry
/// and no bundle is made of.
fn is_finder_entry(entry: &str) -> bool {
    entry.starts_with("__MACOSX/") || entry.rsplit('/').next() == Some(".DS_Store")
}

/// The one top-level folder every entry of a listing sits in.
///
/// Refused, before anything is extracted: an absolute entry, one that climbs
/// with `..`, one written with a backslash, and a listing with no single
/// folder at its top.
fn bundle_root(listing: &str) -> Result<String, String> {
    let mut root: Option<&str> = None;
    for entry in listing.lines().filter(|entry| !entry.is_empty()) {
        if is_finder_entry(entry) {
            continue;
        }
        if entry.starts_with('/')
            || entry.contains('\\')
            || entry.split('/').any(|part| part == "..")
        {
            return Err(format!(
                "the archive holds {entry:?}, which reaches outside it"
            ));
        }
        let (top, _) = entry
            .split_once('/')
            .ok_or_else(|| format!("the archive holds {entry:?} at its top; {LAYOUT}"))?;
        if *root.get_or_insert(top) != top {
            return Err(format!("the archive holds more than one folder; {LAYOUT}"));
        }
    }
    root.map(str::to_string)
        .ok_or_else(|| format!("the archive is empty; {LAYOUT}"))
}

/// Reads a zip bundle.
///
/// The archive is not extracted. Every entry is looked at first — a name that
/// reaches outside, or a symbolic link anywhere, refuses the archive whole: an
/// export never holds a link, and an entry placed under one is the classic way
/// out of the directory an archive is unpacked in. Then the document and the
/// files directly under `attachments/` are written out, each to a path made
/// here, and read back as a folder bundle is.
pub fn stage_zip(file: &Path) -> Result<Staged, String> {
    let not_zip =
        |e: zip::result::ZipError| format!("{} is not a zip archive ({e})", file.display());
    let opened = fs::File::open(file).map_err(|e| format!("reading {}: {e}", file.display()))?;
    let mut archive = zip::ZipArchive::new(opened).map_err(not_zip)?;

    let mut listing = String::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(not_zip)?;
        if entry.is_symlink() {
            return Err("the archive holds a symbolic link, which no bundle does".into());
        }
        listing.push_str(&entry.name().map_err(not_zip)?);
        listing.push('\n');
    }
    let root = bundle_root(&listing)?;

    let scratch = Scratch::new()?;
    let folder = scratch.0.join("bundle");
    let mut documents = 0;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(not_zip)?;
        if !entry.is_file() {
            continue;
        }
        let name = entry.name().map_err(not_zip)?.into_owned();
        let Some(inside) = name.strip_prefix(&format!("{root}/")) else {
            continue;
        };
        let dest = match inside.split_once('/') {
            None if inside.ends_with(".md") && !inside.starts_with('.') => {
                documents += 1;
                folder.join(inside)
            }
            Some((ATTACHMENTS, stored)) => {
                match attachments::path_of(&folder.join(ATTACHMENTS), stored) {
                    Ok(dest) => dest,
                    Err(_) => continue,
                }
            }
            _ => continue,
        };
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|e| format!("reading {name} from the archive: {e}"))?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("making a working directory: {e}"))?;
        }
        fs::write(&dest, bytes).map_err(|e| format!("unpacking {name}: {e}"))?;
    }
    if documents != 1 {
        return Err(format!("the archive holds {documents} .md files; {LAYOUT}"));
    }
    let mut staged = stage_folder(&folder)?;
    staged._scratch = Some(scratch);
    Ok(staged)
}

/// The imports read and not yet placed, by the token the page holds for each.
///
/// The page names an import by token and never by path (ADR 0049): what it may
/// place is only what the user picked in a panel.
#[derive(Debug, Default)]
pub struct Imports {
    held: Mutex<HashMap<String, Arc<Staged>>>,
    next: AtomicU64,
}

impl Imports {
    /// Holds `staged` and answers with its token.
    pub fn hold(&self, staged: Staged) -> String {
        let token = format!("import-{}", self.next.fetch_add(1, Ordering::Relaxed));
        self.lock().insert(token.clone(), Arc::new(staged));
        token
    }

    /// The import `token` names, still held.
    pub fn get(&self, token: &str) -> Result<Arc<Staged>, String> {
        self.lock()
            .get(token)
            .cloned()
            .ok_or_else(|| "that import is no longer held; pick the file again".to_string())
    }

    /// Lets go of an import, placed or abandoned. Its working directory goes
    /// with the last holder.
    pub fn release(&self, token: &str) {
        self.lock().remove(token);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Arc<Staged>>> {
        self.held
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// What placing an import's attachments came to.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Placed {
    /// A carried file stored under another name, old name → new, because the
    /// store already held different bytes under its own.
    pub renames: BTreeMap<String, String>,
    /// A referenced name that neither the import nor the store holds.
    pub broken: Vec<String>,
}

/// Puts the attachments `names` (the ones the document references) in the
/// workspace's store.
///
/// A carried file goes in under its own name; when that name already holds
/// the same bytes there is nothing to do, and when it holds others the file is
/// stored under a fresh name, by the store's own naming.
pub fn place_attachments(
    paths: &DocPaths,
    staged: &Staged,
    names: &[String],
) -> Result<Placed, String> {
    let store = attachments::dir(paths);
    let mut placed = Placed::default();
    for name in names {
        let Ok(dest) = attachments::path_of(&store, name) else {
            placed.broken.push(name.clone());
            continue;
        };
        let Some(source) = staged.files.get(name) else {
            if !dest.exists() {
                placed.broken.push(name.clone());
            }
            continue;
        };
        let bytes = fs::read(source).map_err(|e| format!("reading attachment {name}: {e}"))?;
        match fs::read(&dest) {
            Ok(held) if held == bytes => {}
            Ok(_) => {
                let fresh = attachments::store(&store, name, &bytes)?;
                let stored = fresh.url.trim_start_matches("/attachments/").to_string();
                placed.renames.insert(name.clone(), stored);
            }
            Err(_) => {
                fs::create_dir_all(&store)
                    .map_err(|e| format!("creating the attachment directory: {e}"))?;
                docs::write_atomically(&dest, bytes)?;
            }
        }
    }
    Ok(placed)
}

/// Writes an imported document under `id`.
///
/// An id already taken is refused unless `replace` says the user chose that,
/// and then the document it overwrites is kept as a backup first.
pub fn write_document(
    paths: &DocPaths,
    id: &str,
    content: &str,
    replace: bool,
) -> Result<(), String> {
    if docs::path_of(paths, id)?.exists() {
        if !replace {
            return Err(format!("a conversation called {id} already exists"));
        }
        docs::keep(paths, id)?;
    }
    docs::write(paths, id, content)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A workspace's document directory and a place to export to, removed when
    /// the test ends.
    struct World {
        _scratch: Scratch,
        paths: DocPaths,
        out: PathBuf,
    }

    fn world() -> World {
        let scratch = Scratch::new().unwrap();
        let paths = DocPaths {
            doc_dir: scratch.0.join("docs"),
        };
        let out = scratch.0.join("out");
        fs::create_dir_all(&out).unwrap();
        World {
            _scratch: scratch,
            paths,
            out,
        }
    }

    const DOC: &str = "---\npi: v1\nsession: notes\n---\n\n<!-- you -->\n\nhello\n";

    /// A stored attachment with these bytes under this name.
    fn attach(paths: &DocPaths, name: &str, bytes: &[u8]) {
        let dir = attachments::dir(paths);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(name), bytes).unwrap();
    }

    fn held(paths: &DocPaths, name: &str) -> Option<Vec<u8>> {
        fs::read(attachments::dir(paths).join(name)).ok()
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|name| name.to_string()).collect()
    }

    /// A world holding `notes` and three attachments, two of them its own.
    fn exporting() -> World {
        let w = world();
        docs::write(&w.paths, "notes", DOC).unwrap();
        attach(&w.paths, "shot-a1.png", b"png bytes");
        attach(&w.paths, "paper-b2.pdf", b"pdf bytes");
        attach(&w.paths, "other-c3.png", b"another conversation's");
        w
    }

    #[test]
    fn the_markdown_export_is_the_stored_document() {
        let w = exporting();
        let dest = w.out.join("anything.md");
        export_markdown(&w.paths, "notes", &dest).unwrap();
        assert_eq!(fs::read_to_string(dest).unwrap(), DOC);
    }

    #[test]
    fn a_conversation_is_exported_into_a_folder_under_its_own_name_in_each_kind() {
        let w = exporting();
        let own = names(&["shot-a1.png"]);
        let (name, missing) =
            export_into(&w.paths, "notes", Kind::Markdown, &own, None, &w.out).unwrap();
        assert_eq!((name.as_str(), missing.len()), ("notes.md", 0));
        assert_eq!(fs::read_to_string(w.out.join("notes.md")).unwrap(), DOC);
        let (name, _) = export_into(&w.paths, "notes", Kind::Folder, &own, None, &w.out).unwrap();
        assert_eq!(name, "notes");
        assert!(w.out.join("notes/attachments/shot-a1.png").exists());
        let (name, _) = export_into(&w.paths, "notes", Kind::Zip, &own, None, &w.out).unwrap();
        assert_eq!(name, "notes.zip");
        assert_eq!(stage_zip(&w.out.join("notes.zip")).unwrap().content, DOC);
    }

    #[test]
    fn a_name_the_folder_already_has_is_never_written_over() {
        let w = exporting();
        fs::write(w.out.join("notes.md"), "somebody's own notes").unwrap();
        fs::write(w.out.join("notes.zip"), "an older export").unwrap();
        fs::create_dir_all(w.out.join("notes")).unwrap();
        for kind in [Kind::Markdown, Kind::Folder, Kind::Zip] {
            let error = export_into(&w.paths, "notes", kind, &[], None, &w.out).unwrap_err();
            assert!(error.contains("is already there"), "{kind:?}: {error}");
        }
        assert_eq!(
            fs::read_to_string(w.out.join("notes.md")).unwrap(),
            "somebody's own notes"
        );
        assert_eq!(
            fs::read_to_string(w.out.join("notes.zip")).unwrap(),
            "an older export"
        );
        assert!(visible(&w.out.join("notes")).unwrap().is_empty());
    }

    #[test]
    fn an_export_names_a_kind_or_is_refused_and_an_id_that_is_a_path_is_refused() {
        assert_eq!(Kind::named("zip"), Ok(Kind::Zip));
        assert_eq!(Kind::named("pdf"), Ok(Kind::Pdf));
        assert!(Kind::named("docx").is_err());
        let w = exporting();
        assert!(export_into(&w.paths, "../notes", Kind::Markdown, &[], None, &w.out).is_err());
        assert!(visible(&w.out).unwrap().is_empty());
    }

    #[test]
    fn a_drawn_kind_is_written_as_what_was_drawn_under_the_conversations_name() {
        let w = exporting();
        let (name, missing) = export_into(
            &w.paths,
            "notes",
            Kind::Html,
            &[],
            Some(b"<p>drawn</p>"),
            &w.out,
        )
        .unwrap();
        assert_eq!((name.as_str(), missing.len()), ("notes.html", 0));
        assert_eq!(
            fs::read_to_string(w.out.join("notes.html")).unwrap(),
            "<p>drawn</p>"
        );
        let (name, _) =
            export_into(&w.paths, "notes", Kind::Pdf, &[], Some(b"%PDF-"), &w.out).unwrap();
        assert_eq!(name, "notes.pdf");
        assert_eq!(fs::read(w.out.join("notes.pdf")).unwrap(), b"%PDF-");
    }

    #[test]
    fn a_drawn_kind_with_nothing_drawn_or_a_name_already_there_writes_nothing() {
        let w = exporting();
        for kind in [Kind::Html, Kind::Pdf] {
            let error = export_into(&w.paths, "notes", kind, &[], None, &w.out).unwrap_err();
            assert!(error.contains("nothing was drawn"), "{kind:?}: {error}");
        }
        assert!(visible(&w.out).unwrap().is_empty());
        fs::write(w.out.join("notes.html"), "an older export").unwrap();
        let error =
            export_into(&w.paths, "notes", Kind::Html, &[], Some(b"new"), &w.out).unwrap_err();
        assert!(error.contains("is already there"), "{error}");
        assert_eq!(
            fs::read_to_string(w.out.join("notes.html")).unwrap(),
            "an older export"
        );
        assert!(export_into(&w.paths, "../notes", Kind::Html, &[], Some(b"x"), &w.out).is_err());
    }

    #[test]
    fn the_folder_of_an_export_is_named_by_its_token_until_the_next_export() {
        let exports = Exports::default();
        let first = exports.hold(PathBuf::from("first"));
        assert_eq!(exports.get(&first), Ok(PathBuf::from("first")));
        let second = exports.hold(PathBuf::from("second"));
        assert!(exports.get(&first).is_err());
        assert_eq!(exports.get(&second), Ok(PathBuf::from("second")));
        assert!(exports.get("../somewhere").is_err());
    }

    #[test]
    fn a_document_never_saved_is_not_exported() {
        let w = world();
        let error = export_markdown(&w.paths, "ghost", &w.out.join("ghost.md")).unwrap_err();
        assert!(error.contains("has not been saved"), "{error}");
        assert!(!w.out.join("ghost.md").exists());
    }

    #[test]
    fn a_folder_bundle_carries_the_document_and_only_the_attachments_named() {
        let w = exporting();
        let dest = w.out.join("notes");
        let missing = export_folder(
            &w.paths,
            "notes",
            &names(&["shot-a1.png", "paper-b2.pdf"]),
            &dest,
        )
        .unwrap();
        assert!(missing.is_empty());
        assert_eq!(fs::read_to_string(dest.join("notes.md")).unwrap(), DOC);
        assert_eq!(
            fs::read(dest.join("attachments/shot-a1.png")).unwrap(),
            b"png bytes"
        );
        assert!(dest.join("attachments/paper-b2.pdf").exists());
        assert!(!dest.join("attachments/other-c3.png").exists());
    }

    #[test]
    fn a_bundle_with_no_attachments_has_no_attachments_folder() {
        let w = exporting();
        let dest = w.out.join("notes");
        export_folder(&w.paths, "notes", &[], &dest).unwrap();
        assert!(dest.join("notes.md").exists());
        assert!(!dest.join("attachments").exists());
    }

    #[test]
    fn an_attachment_the_store_lacks_is_named_and_the_export_still_happens() {
        let w = exporting();
        let dest = w.out.join("notes");
        let missing = export_folder(
            &w.paths,
            "notes",
            &names(&["shot-a1.png", "gone-d4.png", "../docs/notes.md"]),
            &dest,
        )
        .unwrap();
        assert_eq!(missing, names(&["gone-d4.png", "../docs/notes.md"]));
        assert!(dest.join("attachments/shot-a1.png").exists());
        assert_eq!(visible(&dest.join("attachments")).unwrap().len(), 1);
    }

    #[test]
    fn a_folder_that_holds_files_is_not_exported_into_but_an_empty_one_is() {
        let w = exporting();
        let full = w.out.join("full");
        fs::create_dir_all(&full).unwrap();
        fs::write(full.join("mine.txt"), "keep").unwrap();
        let error = export_folder(&w.paths, "notes", &[], &full).unwrap_err();
        assert!(error.contains("already holds files"), "{error}");
        assert!(!full.join("notes.md").exists());

        let empty = w.out.join("empty");
        fs::create_dir_all(&empty).unwrap();
        export_folder(&w.paths, "notes", &[], &empty).unwrap();
        assert!(empty.join("notes.md").exists());
    }

    /// Exports `notes` with its two attachments from one world and stages the
    /// result in a fresh one, as a folder or as a zip.
    fn carried(zip: bool) -> (World, Staged) {
        let from = exporting();
        let own = names(&["shot-a1.png", "paper-b2.pdf"]);
        let into = world();
        let staged = if zip {
            let dest = into.out.join("notes.zip");
            export_zip(&from.paths, "notes", &own, &dest).unwrap();
            stage_zip(&dest).unwrap()
        } else {
            let dest = into.out.join("notes");
            export_folder(&from.paths, "notes", &own, &dest).unwrap();
            stage_folder(&dest).unwrap()
        };
        (into, staged)
    }

    fn arrives_whole(zip: bool) {
        let (w, staged) = carried(zip);
        assert_eq!(staged.name, "notes");
        assert_eq!(staged.content, DOC);
        assert_eq!(
            staged.attachments(),
            names(&["paper-b2.pdf", "shot-a1.png"])
        );
        let placed = place_attachments(&w.paths, &staged, &staged.attachments()).unwrap();
        assert_eq!(placed, Placed::default());
        write_document(&w.paths, &staged.name, &staged.content, false).unwrap();
        assert_eq!(docs::read(&w.paths, "notes").unwrap().as_deref(), Some(DOC));
        assert_eq!(held(&w.paths, "shot-a1.png").unwrap(), b"png bytes");
        assert_eq!(held(&w.paths, "paper-b2.pdf").unwrap(), b"pdf bytes");
    }

    #[test]
    fn a_folder_bundle_imports_as_the_document_and_attachments_it_was() {
        arrives_whole(false);
    }

    #[test]
    fn a_zip_bundle_imports_as_the_document_and_attachments_it_was() {
        arrives_whole(true);
    }

    #[test]
    fn a_zip_bundle_has_its_folder_as_its_one_top_level_entry() {
        let w = exporting();
        let dest = w.out.join("notes.zip");
        export_zip(&w.paths, "notes", &names(&["shot-a1.png"]), &dest).unwrap();
        let archive = zip::ZipArchive::new(fs::File::open(&dest).unwrap()).unwrap();
        let mut entries: Vec<String> = archive
            .file_names()
            .map(|name| name.unwrap().into_owned())
            .collect();
        entries.sort();
        assert_eq!(
            entries,
            ["notes/", "notes/attachments/shot-a1.png", "notes/notes.md"]
        );
    }

    #[test]
    fn a_markdown_file_alone_imports_and_its_links_with_no_file_are_broken() {
        let w = world();
        let file = w.out.join("lone.md");
        fs::write(&file, DOC).unwrap();
        let staged = stage_markdown(&file).unwrap();
        assert_eq!(staged.name, "lone");
        assert!(staged.attachments().is_empty());
        // One the workspace already holds is not broken: the link resolves.
        attach(&w.paths, "here-e5.png", b"held");
        let placed =
            place_attachments(&w.paths, &staged, &names(&["here-e5.png", "gone-d4.png"])).unwrap();
        assert_eq!(placed.broken, names(&["gone-d4.png"]));
        assert!(placed.renames.is_empty());
    }

    #[test]
    fn only_the_attachments_the_document_references_are_placed() {
        let (w, staged) = carried(false);
        place_attachments(&w.paths, &staged, &names(&["shot-a1.png"])).unwrap();
        assert!(held(&w.paths, "shot-a1.png").is_some());
        assert!(held(&w.paths, "paper-b2.pdf").is_none());
    }

    #[test]
    fn a_carried_file_the_store_already_holds_is_left_alone() {
        let (w, staged) = carried(false);
        attach(&w.paths, "shot-a1.png", b"png bytes");
        let placed = place_attachments(&w.paths, &staged, &names(&["shot-a1.png"])).unwrap();
        assert_eq!(placed, Placed::default());
        assert_eq!(visible(&attachments::dir(&w.paths)).unwrap().len(), 1);
    }

    #[test]
    fn a_carried_file_whose_name_holds_other_bytes_is_stored_under_a_fresh_name() {
        let (w, staged) = carried(false);
        attach(&w.paths, "shot-a1.png", b"somebody else's picture");
        let placed = place_attachments(&w.paths, &staged, &names(&["shot-a1.png"])).unwrap();
        let fresh = &placed.renames["shot-a1.png"];
        assert_ne!(fresh, "shot-a1.png");
        assert_eq!(held(&w.paths, fresh).unwrap(), b"png bytes");
        assert_eq!(
            held(&w.paths, "shot-a1.png").unwrap(),
            b"somebody else's picture"
        );
    }

    #[test]
    fn a_folder_with_no_document_or_with_two_is_not_a_bundle() {
        let w = world();
        let none = w.out.join("none");
        fs::create_dir_all(&none).unwrap();
        fs::write(none.join("readme.txt"), "x").unwrap();
        assert!(stage_folder(&none).unwrap_err().contains("holds 0 .md"));

        let two = w.out.join("two");
        fs::create_dir_all(&two).unwrap();
        fs::write(two.join("a.md"), "a").unwrap();
        fs::write(two.join("b.md"), "b").unwrap();
        assert!(stage_folder(&two).unwrap_err().contains("holds 2 .md"));

        // One document beside other files is a bundle; the rest is ignored.
        fs::remove_file(two.join("b.md")).unwrap();
        fs::write(two.join("notes.txt"), "x").unwrap();
        fs::write(two.join(".DS_Store"), "x").unwrap();
        assert_eq!(stage_folder(&two).unwrap().name, "a");
    }

    #[test]
    fn nothing_is_read_through_a_symlink() {
        use std::os::unix::fs::symlink;
        let w = world();
        let secret = w.out.join("secret.txt");
        fs::write(&secret, "private").unwrap();

        let dir = w.out.join("linked");
        fs::create_dir_all(dir.join("attachments")).unwrap();
        fs::write(dir.join("notes.md"), DOC).unwrap();
        fs::write(dir.join("attachments/real-a1.png"), "real").unwrap();
        symlink(&secret, dir.join("attachments/link-b2.png")).unwrap();
        symlink(&secret, dir.join("also.md")).unwrap();
        let staged = stage_folder(&dir).unwrap();
        assert_eq!(staged.name, "notes");
        assert_eq!(staged.attachments(), names(&["real-a1.png"]));

        // The attachments folder itself a link: nothing under it is taken.
        let outside = w.out.join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("stolen-c3.png"), "x").unwrap();
        let dir = w.out.join("linked-dir");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("notes.md"), DOC).unwrap();
        symlink(&outside, dir.join("attachments")).unwrap();
        assert!(stage_folder(&dir).unwrap().attachments().is_empty());
    }

    /// An archive of these entries: a file's bytes, or a link's target.
    fn zip_of(entries: &[(&str, Result<&[u8], &str>)]) -> Vec<u8> {
        let options = zip::write::SimpleFileOptions::default();
        let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, content) in entries {
            match content {
                Ok(bytes) => {
                    archive.start_file(*name, options).unwrap();
                    archive.write_all(bytes).unwrap();
                }
                Err(target) => archive.add_symlink(*name, *target, options).unwrap(),
            }
        }
        archive.finish().unwrap().into_inner()
    }

    #[test]
    fn an_archive_holding_a_symlink_is_refused_whole() {
        let w = world();
        let plain: [(&str, Result<&[u8], &str>); 2] = [
            ("notes/notes.md", Ok(DOC.as_bytes())),
            ("notes/attachments/real-a1.png", Ok(b"real")),
        ];
        let zip = w.out.join("plain.zip");
        fs::write(&zip, zip_of(&plain)).unwrap();
        assert_eq!(
            stage_zip(&zip).unwrap().attachments(),
            names(&["real-a1.png"])
        );

        // The same archive with a link in it, and a file placed "under" the
        // link: the way an archive writes outside where it is unpacked.
        let mut linked = plain.to_vec();
        linked.push(("notes/attachments/out", Err("../../..")));
        linked.push(("notes/attachments/out/evil.png", Ok(b"gotcha")));
        let zip = w.out.join("linked.zip");
        fs::write(&zip, zip_of(&linked)).unwrap();
        let error = stage_zip(&zip).unwrap_err();
        assert!(error.contains("symbolic link"), "{error}");
    }

    #[test]
    fn only_the_document_and_the_files_under_attachments_leave_an_archive() {
        let w = world();
        let zip = w.out.join("extras.zip");
        fs::write(
            &zip,
            zip_of(&[
                ("notes/notes.md", Ok(DOC.as_bytes())),
                ("notes/attachments/real-a1.png", Ok(b"real")),
                ("notes/attachments/.hidden", Ok(b"x")),
                ("notes/attachments/deeper/nested-b2.png", Ok(b"x")),
                ("notes/elsewhere/other.md", Ok(b"x")),
                ("notes/readme.txt", Ok(b"x")),
                ("notes/.DS_Store", Ok(b"x")),
                ("__MACOSX/notes/._notes.md", Ok(b"x")),
            ]),
        )
        .unwrap();
        let staged = stage_zip(&zip).unwrap();
        assert_eq!(staged.name, "notes");
        assert_eq!(staged.content, DOC);
        assert_eq!(staged.attachments(), names(&["real-a1.png"]));
    }

    #[test]
    fn an_archive_with_no_document_or_with_two_is_not_a_bundle() {
        let w = world();
        let zip = w.out.join("none.zip");
        fs::write(&zip, zip_of(&[("notes/readme.txt", Ok(b"x"))])).unwrap();
        assert!(stage_zip(&zip).unwrap_err().contains("holds 0 .md"));
        let zip = w.out.join("two.zip");
        fs::write(
            &zip,
            zip_of(&[("notes/a.md", Ok(b"a")), ("notes/b.md", Ok(b"b"))]),
        )
        .unwrap();
        assert!(stage_zip(&zip).unwrap_err().contains("holds 2 .md"));
    }

    #[test]
    fn an_archive_listing_that_reaches_outside_is_refused() {
        for hostile in [
            "notes/notes.md\n../evil.md\n",
            "notes/../../evil.md\n",
            "/etc/evil.md\n",
            "notes/notes.md\nnotes\\..\\evil.md\n",
        ] {
            let error = bundle_root(hostile).unwrap_err();
            assert!(error.contains("reaches outside"), "{hostile:?}: {error}");
        }
        // A name that merely contains dots climbs nowhere.
        assert_eq!(bundle_root("notes/\nnotes/a..b.md\n").unwrap(), "notes");
    }

    #[test]
    fn an_archive_without_one_folder_at_its_top_is_refused() {
        assert!(bundle_root("a/a.md\nb/b.md\n")
            .unwrap_err()
            .contains("more than one folder"));
        assert!(bundle_root("notes.md\n")
            .unwrap_err()
            .contains("at its top"));
        assert!(bundle_root("").unwrap_err().contains("is empty"));
    }

    #[test]
    fn finders_own_entries_do_not_count_against_an_archive() {
        let listing =
            "notes/\nnotes/notes.md\nnotes/.DS_Store\n__MACOSX/\n__MACOSX/notes/._notes.md\n";
        assert_eq!(bundle_root(listing).unwrap(), "notes");
    }

    /// A zip holding one stored entry called `name`, written by hand: a name
    /// that climbs is not one a well-behaved writer can be trusted to keep.
    fn zip_with_entry(name: &str, body: &[u8]) -> Vec<u8> {
        let (name, size) = (name.as_bytes(), body.len() as u32);
        let mut zip = Vec::new();
        // Local file header. The CRC is left zero: the entry is refused, or is
        // empty, before any check of it.
        zip.extend_from_slice(b"PK\x03\x04");
        zip.extend_from_slice(&[20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        zip.extend_from_slice(&0u32.to_le_bytes());
        zip.extend_from_slice(&size.to_le_bytes());
        zip.extend_from_slice(&size.to_le_bytes());
        zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes());
        zip.extend_from_slice(name);
        zip.extend_from_slice(body);
        let directory = zip.len() as u32;
        // Central directory entry.
        zip.extend_from_slice(b"PK\x01\x02");
        zip.extend_from_slice(&[20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        zip.extend_from_slice(&0u32.to_le_bytes());
        zip.extend_from_slice(&size.to_le_bytes());
        zip.extend_from_slice(&size.to_le_bytes());
        zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
        zip.extend_from_slice(&[0; 12]);
        zip.extend_from_slice(&0u32.to_le_bytes());
        zip.extend_from_slice(name);
        let directory_size = zip.len() as u32 - directory;
        // End of central directory.
        zip.extend_from_slice(b"PK\x05\x06");
        zip.extend_from_slice(&[0, 0, 0, 0, 1, 0, 1, 0]);
        zip.extend_from_slice(&directory_size.to_le_bytes());
        zip.extend_from_slice(&directory.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes());
        zip
    }

    #[test]
    fn an_archive_that_climbs_is_refused_and_nothing_of_it_is_written() {
        let w = world();
        let zip = w.out.join("hostile.zip");
        fs::write(&zip, zip_with_entry("../evil.md", b"gotcha")).unwrap();
        let error = stage_zip(&zip).unwrap_err();
        assert!(error.contains("reaches outside"), "{error}");
        assert!(!w.out.join("evil.md").exists());
        assert!(!std::env::temp_dir().join("evil.md").exists());

        // The same archive with its entry in place is read.
        let zip = w.out.join("plain.zip");
        fs::write(&zip, zip_with_entry("notes/notes.md", b"")).unwrap();
        assert_eq!(stage_zip(&zip).unwrap().name, "notes");
    }

    #[test]
    fn a_file_that_is_no_archive_says_so() {
        let w = world();
        let file = w.out.join("not.zip");
        fs::write(&file, "plain text").unwrap();
        assert!(stage_zip(&file)
            .unwrap_err()
            .contains("is not a zip archive"));
    }

    #[test]
    fn a_held_import_is_reached_by_its_token_until_released_and_by_no_other() {
        let w = world();
        let file = w.out.join("lone.md");
        fs::write(&file, DOC).unwrap();
        let imports = Imports::default();
        let first = imports.hold(stage_markdown(&file).unwrap());
        let second = imports.hold(stage_markdown(&file).unwrap());
        assert_ne!(first, second);
        assert_eq!(imports.get(&first).unwrap().name, "lone");
        assert!(imports.get("import-99").is_err());
        assert!(imports.get(file.to_str().unwrap()).is_err());
        imports.release(&first);
        assert!(imports.get(&first).is_err());
        assert!(imports.get(&second).is_ok());
    }

    #[test]
    fn an_archives_working_directory_goes_when_its_import_is_released() {
        let (_w, staged) = carried(true);
        let dir = staged._scratch.as_ref().unwrap().0.clone();
        let imports = Imports::default();
        let token = imports.hold(staged);
        assert!(dir.exists());
        imports.release(&token);
        assert!(!dir.exists());
    }

    #[test]
    fn a_name_the_store_refuses_is_refused_and_nothing_is_written() {
        let w = world();
        for bad in ["", ".hidden", "a/b", "a:b"] {
            assert!(
                write_document(&w.paths, bad, DOC, false).is_err(),
                "{bad:?}"
            );
        }
        assert!(!w.paths.doc_dir.exists());
        write_document(&w.paths, "fine name", DOC, false).unwrap();
        assert_eq!(
            docs::read(&w.paths, "fine name").unwrap().as_deref(),
            Some(DOC)
        );
    }

    #[test]
    fn a_taken_name_is_refused_unless_replacing_and_the_replaced_document_is_kept() {
        let w = world();
        docs::write(&w.paths, "notes", "the old one").unwrap();
        let error = write_document(&w.paths, "notes", DOC, false).unwrap_err();
        assert!(error.contains("already exists"), "{error}");
        assert_eq!(
            docs::read(&w.paths, "notes").unwrap().as_deref(),
            Some("the old one")
        );

        write_document(&w.paths, "notes", DOC, true).unwrap();
        assert_eq!(docs::read(&w.paths, "notes").unwrap().as_deref(), Some(DOC));
        let backups = w.paths.doc_dir.join(".backups/notes");
        let kept: Vec<String> = fs::read_dir(backups)
            .unwrap()
            .flatten()
            .map(|file| fs::read_to_string(file.path()).unwrap())
            .collect();
        assert!(
            kept.iter().any(|content| content == "the old one"),
            "{kept:?}"
        );
    }
}
