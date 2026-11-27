//! Which `pi` the app runs.
//!
//! ADR 0004: **it is the user's own pi**, because that is the version their
//! `~/.pi/agent/settings.json` packages were installed against. Running a
//! different one loads those extensions into a pi they were never written for,
//! and the first to extend a class the older pi does not export fails with
//! `Class extends value undefined is not a constructor` — the process exits and
//! no session can start.
//!
//! Which one that is has four answers, in order (ADR 0068): the one `PI_CLI`
//! names, the one the user chose in the Preferences window, the first on the
//! process's `PATH`, and the first on the `PATH` the user's login shell sets,
//! which is where an app the Finder launched finds it (`shell_env.rs`).
//!
//! Then pi's own install is looked at directly, the launcher its installer
//! keeps in the agent directory, so a shell that gave no `PATH` does not hide
//! a pi the user has. A Mac with none of those has no pi of the user's, and so no packages
//! installed against one: there a release runs **the pi it ships**, pi's own
//! standalone build, which needs no Node (ADR 0069). It is the last answer and
//! never a quiet substitute for a pi the user has. A build that ships none
//! says there is no pi, and what to do about it.
//!
//! Pure — it reads only the environment it is handed and the files that
//! environment names.

use std::path::{Path, PathBuf};

/// Where `pi` was found, so the user can be told which one is running.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// `PI_CLI` named it.
    Override,
    /// The user chose it in the Preferences window.
    Chosen,
    /// Found on the process's `PATH`.
    Path,
    /// Found on the `PATH` the user's login shell sets.
    Shell,
    /// pi's own install: the launcher its installer keeps in the agent
    /// directory, whatever `PATH` it was linked onto.
    Installed,
    /// The one the app ships, there being none of the user's.
    Bundled,
}

/// The `pi` to run, and how it was chosen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub path: PathBuf,
    pub source: Source,
}

/// Why there is no `pi` to run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Missing {
    /// The user chose one, and no file is there. Not looked past: a pi the
    /// user pointed at and another one running instead is the failure
    /// ADR 0004 is about, reached quietly.
    Chosen(PathBuf),
    /// None was named, neither `PATH` holds one, and this build ships none.
    Nowhere,
}

impl Missing {
    /// What to tell the user: what was looked for, and what to do about it
    /// (ADR 0011).
    pub fn message(&self) -> String {
        match self {
            Self::Chosen(path) => format!(
                "The pi chosen in Piary → Settings… is not there: {}. Choose another one there, \
                 or let Piary find one.",
                path.display()
            ),
            Self::Nowhere => "Piary found no pi to run. It looked where a terminal would, on \
                              your shell's PATH. Install pi (https://pi.dev), or choose the one \
                              to run in Piary → Settings…."
                .into(),
        }
    }
}

/// What a search for `pi` is handed. Arguments rather than reads of the
/// process environment, which is what lets every branch be tested without
/// changing the environment a parallel test is also reading.
#[derive(Debug, Clone, Copy, Default)]
pub struct Search<'a> {
    /// `PI_CLI`, if set.
    pub pi_cli: Option<&'a str>,
    /// The user's choice, if they made one (`Preferences::pi_path`).
    pub chosen: Option<&'a str>,
    /// The process's `PATH`.
    pub path_var: &'a str,
    /// The login shell's `PATH`, if it gave one (`shell_env::login_path`).
    pub login_path: Option<&'a str>,
    /// Where pi's installer keeps its launcher (`installed_in`), if the agent
    /// directory is known.
    pub installed: Option<&'a Path>,
    /// Where the pi the app ships would be (`bundled_in`), if the app knows
    /// its resources.
    pub bundled: Option<&'a Path>,
}

/// Where pi's own installer keeps the launcher of the pi it manages, under
/// pi's agent directory. It is there whichever directory on `PATH` the
/// installer linked it into, so it is found when the login shell gave no
/// `PATH` to look on: without it, such a Mac would run the shipped pi beside
/// the user's own (ADR 0069).
pub fn installed_in(agent_dir: &Path) -> PathBuf {
    agent_dir.join("bin").join("pi")
}

/// Where the pi a release ships is, under the app's resources: pi's
/// standalone build for the architecture this process runs as, named as pi's
/// releases name it (`scripts/pi-bundle.ts`).
pub fn bundled_in(resource_dir: &Path, arch: &str) -> PathBuf {
    let build = match arch {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => other,
    };
    resource_dir.join("pi").join(build).join("pi")
}

/// Resolves `pi`: `PI_CLI`, else the user's choice, else the first on the
/// process's `PATH`, else the first on the login shell's, else pi's own
/// install, else the one the app ships.
///
/// Package-manager bin directories are skipped: `npm`, `pnpm` and friends
/// prepend a project's `node_modules/.bin` to PATH, and what lives there is
/// the pinned dependency rather than the user's own pi. Looking past them is
/// the whole point of ADR 0004.
pub fn resolve(search: &Search, exists: &dyn Fn(&Path) -> bool) -> Result<Resolved, Missing> {
    if let Some(explicit) = search.pi_cli.filter(|value| !value.is_empty()) {
        return Ok(Resolved {
            path: PathBuf::from(explicit),
            source: Source::Override,
        });
    }
    if let Some(chosen) = search.chosen.filter(|value| !value.is_empty()) {
        let path = PathBuf::from(chosen);
        return if exists(&path) {
            Ok(Resolved {
                path,
                source: Source::Chosen,
            })
        } else {
            Err(Missing::Chosen(path))
        };
    }
    let places = [
        (search.path_var, Source::Path),
        (search.login_path.unwrap_or_default(), Source::Shell),
    ];
    for (path_var, source) in places {
        if let Some(path) = on_path(path_var, exists) {
            return Ok(Resolved { path, source });
        }
    }
    let fallbacks = [
        (search.installed, Source::Installed),
        (search.bundled, Source::Bundled),
    ];
    for (place, source) in fallbacks {
        if let Some(path) = place.filter(|path| exists(path)) {
            return Ok(Resolved {
                path: path.to_path_buf(),
                source,
            });
        }
    }
    Err(Missing::Nowhere)
}

/// The first `pi` in `path_var`'s directories, dependency bins aside.
fn on_path(path_var: &str, exists: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    path_var
        .split(':')
        .filter(|dir| !dir.is_empty())
        .map(Path::new)
        .filter(|dir| !is_dependency_bin(dir))
        .map(|dir| dir.join("pi"))
        .find(|candidate| exists(candidate))
}

/// Whether this PATH entry is a package manager's project-local bin directory.
fn is_dependency_bin(dir: &Path) -> bool {
    dir.file_name().is_some_and(|name| name == ".bin")
        && dir
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|name| name == "node_modules")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Only the paths named here exist.
    fn only(paths: &'static [&'static str]) -> impl Fn(&Path) -> bool {
        move |candidate: &Path| paths.iter().any(|p| Path::new(p) == candidate)
    }

    /// A search of the process's `PATH` alone.
    fn on(path_var: &'static str) -> Search<'static> {
        Search {
            path_var,
            ..Search::default()
        }
    }

    #[test]
    fn pi_cli_wins_over_everything() {
        // The escape hatch: a locally built pi, or a test double.
        let search = Search {
            pi_cli: Some("/built/pi"),
            chosen: Some("/chosen/pi"),
            ..on("/usr/bin")
        };
        let resolved = resolve(&search, &only(&["/usr/bin/pi", "/chosen/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/built/pi"));
        assert_eq!(resolved.source, Source::Override);
    }

    #[test]
    fn an_empty_override_is_not_an_override() {
        // An unset variable arrives as an empty string often enough that
        // treating it as a path would try to run "".
        let search = Search {
            pi_cli: Some(""),
            chosen: Some(""),
            ..on("/usr/bin")
        };
        let resolved = resolve(&search, &only(&["/usr/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/usr/bin/pi"));
        assert_eq!(resolved.source, Source::Path);
    }

    #[test]
    fn the_users_choice_wins_over_what_is_found() {
        let search = Search {
            chosen: Some("/chosen/pi"),
            login_path: Some("/home/bin"),
            ..on("/usr/bin")
        };
        let resolved = resolve(
            &search,
            &only(&["/chosen/pi", "/usr/bin/pi", "/home/bin/pi"]),
        )
        .expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/chosen/pi"));
        assert_eq!(resolved.source, Source::Chosen);
    }

    #[test]
    fn a_choice_that_is_gone_is_said_and_not_looked_past() {
        // Another pi is there to be found, and running it would be running a
        // pi the user did not point at.
        let search = Search {
            chosen: Some("/chosen/pi"),
            ..on("/usr/bin")
        };
        let missing = resolve(&search, &only(&["/usr/bin/pi"])).expect_err("missing");
        assert_eq!(missing, Missing::Chosen(PathBuf::from("/chosen/pi")));
        assert!(missing.message().contains("/chosen/pi"));
        assert!(missing.message().contains("Settings"));
    }

    #[test]
    fn a_pi_only_the_login_shell_knows_is_found() {
        // An app the Finder launched: the process's PATH is launchd's, and
        // the user's pi is where their shell's startup files put it.
        let search = Search {
            login_path: Some("/opt/homebrew/bin:/home/.local/bin"),
            ..on("/usr/bin:/bin:/usr/sbin:/sbin")
        };
        let resolved = resolve(&search, &only(&["/home/.local/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/home/.local/bin/pi"));
        assert_eq!(resolved.source, Source::Shell);
    }

    #[test]
    fn the_process_path_is_searched_before_the_login_shells() {
        // A launch from a terminal already says which pi is meant.
        let search = Search {
            login_path: Some("/home/bin"),
            ..on("/usr/local/bin")
        };
        let resolved =
            resolve(&search, &only(&["/home/bin/pi", "/usr/local/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/usr/local/bin/pi"));
        assert_eq!(resolved.source, Source::Path);
    }

    const SHIPPED: &str = "/Piary.app/Contents/Resources/pi/arm64/pi";

    #[test]
    fn with_no_pi_of_the_users_the_one_the_app_ships_runs() {
        let search = Search {
            login_path: Some("/home/bin"),
            bundled: Some(Path::new(SHIPPED)),
            ..on("/usr/bin")
        };
        let resolved = resolve(&search, &only(&[SHIPPED])).expect("resolved");
        assert_eq!(resolved.path, Path::new(SHIPPED));
        assert_eq!(resolved.source, Source::Bundled);
    }

    #[test]
    fn the_users_own_pi_always_runs_before_the_one_the_app_ships() {
        // ADR 0004: their packages were installed against theirs.
        let exists = only(&[SHIPPED, "/home/bin/pi"]);
        let found = Search {
            login_path: Some("/home/bin"),
            bundled: Some(Path::new(SHIPPED)),
            ..on("/usr/bin")
        };
        assert_eq!(
            resolve(&found, &exists).expect("resolved").source,
            Source::Shell
        );
        // A choice that is gone is still said: the shipped pi is not what the
        // user pointed at.
        let chosen = Search {
            chosen: Some("/chosen/pi"),
            bundled: Some(Path::new(SHIPPED)),
            ..on("/usr/bin")
        };
        assert_eq!(
            resolve(&chosen, &exists),
            Err(Missing::Chosen(PathBuf::from("/chosen/pi")))
        );
    }

    #[test]
    fn a_pi_its_installer_put_there_runs_though_no_shell_said_where() {
        // The login shell gave no PATH: it took too long, or takes no `-lic`.
        // The user's pi is still theirs, and the shipped one must not run in
        // its place against packages installed for another version.
        let search = Search {
            installed: Some(Path::new("/home/.pi/agent/bin/pi")),
            bundled: Some(Path::new(SHIPPED)),
            ..on("/usr/bin")
        };
        let resolved =
            resolve(&search, &only(&[SHIPPED, "/home/.pi/agent/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, Path::new("/home/.pi/agent/bin/pi"));
        assert_eq!(resolved.source, Source::Installed);
        assert_eq!(
            installed_in(Path::new("/home/.pi/agent")),
            Path::new("/home/.pi/agent/bin/pi")
        );
    }

    #[test]
    fn a_build_that_ships_no_pi_has_none_to_fall_back_on() {
        // A development build: the resources hold no pi.
        let search = Search {
            bundled: Some(Path::new("/target/debug/pi/arm64/pi")),
            ..on("/usr/bin")
        };
        assert_eq!(resolve(&search, &only(&[])), Err(Missing::Nowhere));
    }

    #[test]
    fn the_shipped_pi_is_the_build_for_the_architecture_running() {
        let resources = Path::new("/Piary.app/Contents/Resources");
        assert_eq!(bundled_in(resources, "aarch64"), Path::new(SHIPPED));
        // The Intel slice, on an Intel Mac or under Rosetta.
        assert_eq!(
            bundled_in(resources, "x86_64"),
            Path::new("/Piary.app/Contents/Resources/pi/x64/pi")
        );
    }

    #[test]
    fn a_dependency_bin_is_skipped_but_a_real_directory_is_not() {
        // The failure ADR 0004 exists for: a package script prepends
        // node_modules/.bin, which holds the PINNED pi rather than the user's,
        // and running that one loads their extensions into the wrong version.
        let resolved = resolve(
            &on("/repo/node_modules/.bin:/usr/local/bin"),
            &only(&["/repo/node_modules/.bin/pi", "/usr/local/bin/pi"]),
        )
        .expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/usr/local/bin/pi"));

        // The login shell's PATH is held to the same rule.
        let search = Search {
            login_path: Some("/repo/node_modules/.bin"),
            ..on("/usr/bin")
        };
        assert_eq!(
            resolve(&search, &only(&["/repo/node_modules/.bin/pi"])),
            Err(Missing::Nowhere)
        );

        // The pair: a directory merely CALLED .bin, not under node_modules, is
        // an ordinary place for a binary and must still be searched.
        let ordinary = resolve(&on("/opt/.bin"), &only(&["/opt/.bin/pi"])).expect("resolved");
        assert_eq!(ordinary.path, PathBuf::from("/opt/.bin/pi"));
    }

    #[test]
    fn the_first_match_on_path_wins() {
        // PATH order is the user's statement about which pi they mean.
        let resolved = resolve(&on("/a:/b"), &only(&["/a/pi", "/b/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/a/pi"));
    }

    #[test]
    fn empty_path_entries_are_ignored() {
        // A trailing or doubled colon is common and means the current
        // directory, which is not somewhere to look for the user's pi.
        let resolved = resolve(&on("::/usr/bin:"), &only(&["/usr/bin/pi"])).expect("resolved");
        assert_eq!(resolved.path, PathBuf::from("/usr/bin/pi"));
    }

    #[test]
    fn no_pi_anywhere_names_what_to_do() {
        // There is no bundled fallback in a Tauri app, so this is a real
        // outcome the caller has to report rather than paper over.
        let missing = resolve(&on("/usr/bin:/bin"), &only(&[])).expect_err("missing");
        assert_eq!(missing, Missing::Nowhere);
        // Nothing a user who launched the app from the Finder cannot do.
        assert!(missing.message().contains("Install pi"));
        assert!(missing.message().contains("Settings"));
        assert!(!missing.message().contains("PI_CLI"));
    }
}
