//! Which `pi` the app runs.
//!
//! ADR 0004: **it is the user's own pi**, because that is the version their
//! `~/.pi/agent/settings.json` packages were installed against. Running a
//! different one loads those extensions into a pi they were never written for,
//! and the first to extend a class the older pi does not export fails with
//! `Class extends value undefined is not a constructor` — the process exits and
//! no session can start.
//!
//! The app bundles no Node, so unlike the browser bridge **there is no bundled
//! fallback**: nothing on PATH is a failure that has to name the fix rather
//! than being silently worked around.
//!
//! Pure — it reads only the environment it is handed and the files that
//! environment names.

use std::path::{Path, PathBuf};

/// Where `pi` was found, so the startup line can say which one is running.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    /// `PI_CLI` named it.
    Override,
    /// Found on `PATH`.
    Path,
}

/// The `pi` to run, and how it was chosen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub path: PathBuf,
    pub source: Source,
}

/// Resolves `pi` from `PI_CLI`, else from `PATH`.
///
/// `path_var` and `pi_cli` are arguments rather than reads of the process
/// environment, which is what lets every branch be tested without changing the
/// environment a parallel test is also reading.
///
/// Package-manager bin directories are skipped: `npm`, `pnpm` and friends
/// prepend a project's `node_modules/.bin` to PATH, and what lives there is
/// the pinned dependency rather than the user's own pi. Looking past them is
/// the whole point of ADR 0004.
pub fn resolve(
    path_var: &str,
    pi_cli: Option<&str>,
    exists: &dyn Fn(&Path) -> bool,
) -> Option<Resolved> {
    if let Some(explicit) = pi_cli.filter(|value| !value.is_empty()) {
        return Some(Resolved {
            path: PathBuf::from(explicit),
            source: Source::Override,
        });
    }
    for dir in path_var.split(':').filter(|dir| !dir.is_empty()) {
        let dir = Path::new(dir);
        if is_dependency_bin(dir) {
            continue;
        }
        let candidate = dir.join("pi");
        if exists(&candidate) {
            return Some(Resolved {
                path: candidate,
                source: Source::Path,
            });
        }
    }
    None
}

/// Whether this PATH entry is a package manager's project-local bin directory.
fn is_dependency_bin(dir: &Path) -> bool {
    dir.file_name().is_some_and(|name| name == ".bin")
        && dir
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|name| name == "node_modules")
}

/// What to tell the user when there is no `pi` to run.
///
/// Names the fix, because a Tauri app has nothing to fall back on and a bare
/// "not found" leaves someone guessing (ADR 0004, ADR 0011).
pub const MISSING: &str =
    "Piary runs your own pi, and there is none on PATH. Install it, or set PI_CLI to point at one.";

#[cfg(test)]
mod tests {
    use super::*;

    /// Only the paths named here exist.
    fn only(paths: &'static [&'static str]) -> impl Fn(&Path) -> bool {
        move |candidate: &Path| paths.iter().any(|p| Path::new(p) == candidate)
    }

    #[test]
    fn pi_cli_wins_over_everything() {
        // The escape hatch: a locally built pi, or a test double.
        let resolved =
            resolve("/usr/bin", Some("/built/pi"), &only(&["/usr/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/built/pi"));
        assert_eq!(resolved.source, Source::Override);
    }

    #[test]
    fn an_empty_override_is_not_an_override() {
        // An unset variable arrives as an empty string often enough that
        // treating it as a path would try to run "".
        let resolved = resolve("/usr/bin", Some(""), &only(&["/usr/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/usr/bin/pi"));
        assert_eq!(resolved.source, Source::Path);
    }

    #[test]
    fn a_dependency_bin_is_skipped_but_a_real_directory_is_not() {
        // The failure ADR 0004 exists for: a package script prepends
        // node_modules/.bin, which holds the PINNED pi rather than the user's,
        // and running that one loads their extensions into the wrong version.
        let path = "/repo/node_modules/.bin:/usr/local/bin";
        let resolved = resolve(
            path,
            None,
            &only(&["/repo/node_modules/.bin/pi", "/usr/local/bin/pi"]),
        )
        .expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/usr/local/bin/pi"));

        // The pair: a directory merely CALLED .bin, not under node_modules, is
        // an ordinary place for a binary and must still be searched.
        let ordinary = resolve("/opt/.bin", None, &only(&["/opt/.bin/pi"])).expect("resolved");
        assert_eq!(ordinary.path, PathBuf::from("/opt/.bin/pi"));
    }

    #[test]
    fn the_first_match_on_path_wins() {
        // PATH order is the user's statement about which pi they mean.
        let resolved = resolve("/a:/b", None, &only(&["/a/pi", "/b/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/a/pi"));
    }

    #[test]
    fn empty_path_entries_are_ignored() {
        // A trailing or doubled colon is common and means the current
        // directory, which is not somewhere to look for the user's pi.
        let resolved = resolve("::/usr/bin:", None, &only(&["/usr/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/usr/bin/pi"));
    }

    #[test]
    fn nothing_on_path_resolves_to_nothing() {
        // There is no bundled fallback in a Tauri app, so this is a real
        // outcome the caller has to report rather than paper over.
        assert!(resolve("/usr/bin:/bin", None, &only(&[])).is_none());
    }

    #[test]
    fn the_missing_message_names_the_fix() {
        assert!(MISSING.contains("Install"));
        assert!(MISSING.contains("PI_CLI"));
    }
}
