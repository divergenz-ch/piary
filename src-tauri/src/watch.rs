//! Noticing that a document changed underneath us.
//!
//! A conversation is a file anyone may edit (ADR 0001), so the app has to cope
//! with iA Writer or `git checkout` changing one while a window has it open.
//! This module turns filesystem events into document ids and nothing more: the
//! decision about what to do with a changed document belongs to the page, and
//! the Tauri wiring belongs to `commands.rs` (ADR 0014).

use std::path::Path;

/// The document id a changed path refers to, when the path is a document at all.
///
/// Returns `None` for a temp file, an attachment, a directory, or anything
/// without a `.md` extension. The temp-file case is the one that matters: every
/// atomic write (`docs::write`) creates and renames one, so a watcher that did
/// not filter them would report a change for each save twice — once as the
/// temp file, once as the document.
pub fn document_id_of(path: &Path) -> Option<String> {
    if path.extension()? != "md" {
        return None;
    }
    let stem = path.file_stem()?.to_string_lossy().into_owned();
    // The same rule the store uses to decide what it would have written. A
    // dotfile is `docs::write`'s temp file mid-rename, or someone else's.
    if crate::docs::check_id(&stem).is_err() {
        return None;
    }
    Some(stem)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn a_document_path_yields_its_id() {
        assert_eq!(
            document_id_of(&PathBuf::from("/docs/abc.md")),
            Some("abc".into())
        );
    }

    #[test]
    fn a_temp_file_from_an_atomic_write_is_ignored() {
        // docs::write creates `.<id>.<pid>.tmp` and renames it. Reporting it
        // would double every save, and the id it looks like is not one.
        assert_eq!(document_id_of(&PathBuf::from("/docs/.abc.1234.tmp")), None);
        // The pair: the real document behind that write still resolves.
        assert_eq!(
            document_id_of(&PathBuf::from("/docs/abc.md")),
            Some("abc".into())
        );
    }

    #[test]
    fn a_non_markdown_file_is_ignored() {
        assert_eq!(document_id_of(&PathBuf::from("/docs/notes.txt")), None);
        assert_eq!(document_id_of(&PathBuf::from("/docs/image.png")), None);
    }

    #[test]
    fn a_path_with_no_extension_is_ignored() {
        assert_eq!(document_id_of(&PathBuf::from("/docs/attachments")), None);
    }

    #[test]
    fn a_hidden_markdown_file_is_ignored() {
        // check_id refuses to create one, so a dotted `.md` is not ours.
        assert_eq!(document_id_of(&PathBuf::from("/docs/.hidden.md")), None);
    }
}
