//! Piary's own pi package (`pi-extension/`, named `pi-ui-views`): the `view`
//! and `cell` tools and the skill that explains them, which the canvas is
//! built to render.
//!
//! The app hands it to every pi it starts, because a workspace that never
//! installed it would otherwise give pi no way to write a view or a cell. One
//! exception: when the user's own settings already install a package of that
//! name, theirs is the one that runs (ADR 0004), whatever its version. Two
//! different copies both registering `cell` is not a precedence question for
//! pi — it reports the conflict and exits at startup, rpc mode included — so
//! adding ours on top would break the session rather than override anything.
//!
//! Pure apart from reading the settings and manifests it is pointed at.

use std::fs;
use std::path::{Path, PathBuf};

/// The package's manifest name.
pub const PACKAGE: &str = "pi-ui-views";

/// The directory the package is shipped in, inside a bundle's resources and
/// inside a checkout alike.
const DIR: &str = "pi-extension";

/// Piary's system prompt, inside the package directory so the bundle carries
/// it with the tools. pi ignores it as a package resource: the manifest lists
/// only `extensions` and `skills`.
const PROMPT: &str = "system-prompt.md";

/// What pi is told about a `[face]` block, beside the prompt: appended only
/// while the user has the face preference on, so a pi that will never be
/// handed a block is told nothing of one.
const FACE_GUIDANCE: &str = "face-guidance.md";

/// How deep under a git install root a package's manifest can sit: pi checks a
/// `git:` source out at `<root>/<host>/<path…>`, and a path is an owner and a
/// repository, sometimes a group more.
const GIT_DEPTH: usize = 4;

/// Where the package is: the bundle's `Resources/pi-extension` when it is
/// there, else the checkout's, beside `src-tauri/`. The caller passes a
/// checkout only in a debug build: a release binary would otherwise reach for
/// the build machine's tree. `None` when neither holds a manifest — no session
/// is refused for it, but no flag is passed either, since pi exits on an
/// `--extension` path that does not exist.
pub fn package_dir(resource_dir: Option<&Path>, checkout: Option<&Path>) -> Option<PathBuf> {
    let bundled = resource_dir.map(|dir| dir.join(DIR));
    let checkout = checkout
        .and_then(|manifest| manifest.parent())
        .map(|repo| repo.join(DIR));
    bundled
        .into_iter()
        .chain(checkout)
        .find(|dir| dir.join("package.json").is_file())
}

/// pi's own agent directory, the way pi resolves it: `PI_CODING_AGENT_DIR`
/// (with a leading `~` expanded) when set, else `<home>/.pi/agent`. `None`
/// with neither, rather than a path relative to wherever the app was started.
pub fn agent_dir(env_dir: Option<&str>, home: Option<&Path>) -> Option<PathBuf> {
    match env_dir.filter(|dir| !dir.is_empty()) {
        Some(dir) => Some(match (dir.strip_prefix("~/"), home) {
            (Some(rest), Some(home)) => home.join(rest),
            _ if dir == "~" => home?.to_path_buf(),
            _ => PathBuf::from(dir),
        }),
        None => home.map(|home| home.join(".pi").join("agent")),
    }
}

/// Whether the user's pi settings already install the package: the global
/// `<agent dir>/settings.json` or the workspace's `<cwd>/.pi/settings.json`.
/// An absent or unreadable settings file installs nothing.
pub fn installs_piary(cwd: &Path, agent: Option<&Path>, home: Option<&Path>) -> bool {
    let project = cwd.join(".pi");
    agent.is_some_and(|agent| scope_installs(agent, home)) || scope_installs(&project, home)
}

/// The flags that load the package: `--extension <dir>`, or nothing when there
/// is no package to point at or the user's own install supplies it.
pub fn extension_args(dir: Option<&Path>, already_installed: bool) -> Vec<String> {
    match dir {
        Some(dir) if !already_installed => {
            vec!["--extension".into(), dir.to_string_lossy().into_owned()]
        }
        _ => Vec::new(),
    }
}

/// The flags that add Piary's prompt to pi's own: `--append-system-prompt
/// <dir>/system-prompt.md`, and with `face` a second one for
/// `face-guidance.md` (pi takes the flag more than once). Nothing for a file
/// that is not there. Appended, not replacing, so pi keeps its own tool
/// guidance across upgrades. Only an existing path is passed: pi reads the
/// value as a file when the path exists and otherwise appends the string
/// itself as prompt text, silently.
///
/// The prompt is the app's whoever supplies the tools, so it does not depend
/// on the user's own install the way the extension flag does.
pub fn prompt_args(dir: Option<&Path>, face: bool) -> Vec<String> {
    let Some(dir) = dir else {
        return Vec::new();
    };
    [Some(PROMPT), face.then_some(FACE_GUIDANCE)]
        .into_iter()
        .flatten()
        .map(|file| dir.join(file))
        .filter(|path| path.is_file())
        .flat_map(|path| {
            [
                "--append-system-prompt".to_string(),
                path.to_string_lossy().into_owned(),
            ]
        })
        .collect()
}

/// Where a session's pi looks for packages: the app's own copy, the workspace,
/// and the user's agent directory and home.
pub struct Places<'a> {
    pub resource_dir: Option<&'a Path>,
    pub checkout: Option<&'a Path>,
    pub cwd: &'a Path,
    pub agent: Option<&'a Path>,
    pub home: Option<&'a Path>,
    /// Whether the user has the face preference on (`prompt_args`).
    pub face: bool,
}

/// Every flag the app adds to a session's start, ahead of the page's own: what
/// `pi_start` passes, gathered here so a test can see it without an app.
pub fn session_args(places: &Places, page: Vec<String>) -> Vec<String> {
    let dir = package_dir(places.resource_dir, places.checkout);
    let installed = installs_piary(places.cwd, places.agent, places.home);
    let mut args = extension_args(dir.as_deref(), installed);
    args.extend(prompt_args(dir.as_deref(), places.face));
    args.extend(page);
    args
}

/// Whether one settings scope (a directory holding `settings.json`, and `git/`
/// for its git installs) names the package among its `packages`.
fn scope_installs(scope: &Path, home: Option<&Path>) -> bool {
    let Ok(text) = fs::read_to_string(scope.join("settings.json")) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    json.get("packages")
        .and_then(|packages| packages.as_array())
        .into_iter()
        .flatten()
        .filter_map(source_of)
        .any(|source| names_piary(source, scope, home))
}

/// A `packages` entry is a source string, or an object carrying one.
fn source_of(entry: &serde_json::Value) -> Option<&str> {
    entry
        .as_str()
        .or_else(|| entry.get("source").and_then(|source| source.as_str()))
}

/// Whether a package source is this package: `npm:pi-ui-views[@version]` by
/// name, a local path by the `name` in its manifest, and a `git:` or URL source
/// by whether the scope's git checkouts hold a manifest of that name — the
/// source alone does not say what its repository is called.
fn names_piary(source: &str, scope: &Path, home: Option<&Path>) -> bool {
    if let Some(spec) = source.strip_prefix("npm:") {
        return spec == PACKAGE || spec.starts_with(&format!("{PACKAGE}@"));
    }
    if source.starts_with("git:") || source.contains("://") {
        return holds_piary(&scope.join("git"), GIT_DEPTH);
    }
    let path = match (source.strip_prefix("~/"), home) {
        (Some(rest), Some(home)) => home.join(rest),
        (Some(_), None) => return false,
        (None, _) => scope.join(source),
    };
    is_piary(&path)
}

/// Whether `dir` is the package: its manifest names it.
fn is_piary(dir: &Path) -> bool {
    fs::read_to_string(dir.join("package.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|manifest| manifest.get("name")?.as_str().map(|name| name == PACKAGE))
        .unwrap_or(false)
}

/// Whether the package sits anywhere under `dir`, at most `depth` levels down.
fn holds_piary(dir: &Path, depth: usize) -> bool {
    if is_piary(dir) {
        return true;
    }
    if depth == 0 {
        return false;
    }
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .any(|entry| holds_piary(&entry.path(), depth - 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A directory under the OS temp dir, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("piary-extension-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
        fn write(&self, rel: &str, text: &str) -> PathBuf {
            let path = self.0.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, text).unwrap();
            path
        }
        fn path(&self, rel: &str) -> PathBuf {
            self.0.join(rel)
        }
        /// Whether the workspace `work/` or the agent dir `home/.pi/agent`
        /// installs the package, with `home/` as home.
        fn installs(&self) -> bool {
            let agent = self.path("home/.pi/agent");
            installs_piary(&self.path("work"), Some(&agent), Some(&self.path("home")))
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const MANIFEST: &str = r#"{"name":"pi-ui-views"}"#;

    #[test]
    fn the_bundled_package_wins_over_the_checkout() {
        let s = Scratch::new("bundled");
        s.write("Resources/pi-extension/package.json", MANIFEST);
        s.write("repo/pi-extension/package.json", MANIFEST);
        let checkout = s.path("repo/src-tauri");
        let found = package_dir(Some(&s.path("Resources")), Some(&checkout));
        assert_eq!(found, Some(s.path("Resources/pi-extension")));
    }

    #[test]
    fn a_checkout_finds_the_package_beside_src_tauri() {
        let s = Scratch::new("checkout");
        s.write("repo/pi-extension/package.json", MANIFEST);
        let checkout = s.path("repo/src-tauri");
        let found = package_dir(Some(&s.path("Resources")), Some(&checkout));
        assert_eq!(found, Some(s.path("repo/pi-extension")));
    }

    #[test]
    fn without_a_checkout_only_the_bundle_counts() {
        // A release build passes no checkout: the build machine's tree is not
        // a place a shipped app may load code from.
        let s = Scratch::new("release");
        s.write("repo/pi-extension/package.json", MANIFEST);
        assert_eq!(package_dir(Some(&s.path("Resources")), None), None);
    }

    #[test]
    fn this_checkout_ships_the_package() {
        // The fallback a dev build relies on, against the real tree.
        let found = package_dir(None, Some(Path::new(env!("CARGO_MANIFEST_DIR"))));
        assert!(
            found.is_some(),
            "pi-extension/package.json not found beside src-tauri"
        );
    }

    #[test]
    fn the_agent_dir_is_resolved_the_way_pi_resolves_it() {
        let home = Path::new("/u");
        assert_eq!(
            agent_dir(None, Some(home)),
            Some(PathBuf::from("/u/.pi/agent"))
        );
        assert_eq!(
            agent_dir(Some("/elsewhere"), Some(home)),
            Some(PathBuf::from("/elsewhere"))
        );
        assert_eq!(
            agent_dir(Some("~/pi"), Some(home)),
            Some(PathBuf::from("/u/pi"))
        );
        assert_eq!(
            agent_dir(Some(""), Some(home)),
            Some(PathBuf::from("/u/.pi/agent"))
        );
        assert_eq!(agent_dir(None, None), None);
    }

    #[test]
    fn nothing_installed_passes_the_package() {
        let s = Scratch::new("bare");
        let dir = s.path("pkg");
        assert!(!s.installs());
        assert_eq!(
            extension_args(Some(&dir), false),
            vec![
                "--extension".to_string(),
                dir.to_string_lossy().into_owned()
            ]
        );
    }

    #[test]
    fn a_workspace_install_by_relative_path_is_the_users_own() {
        // This repo's own shape: `.pi/settings.json` → `"../pi-extension"`.
        let s = Scratch::new("project");
        s.write(
            "work/.pi/settings.json",
            r#"{"packages":["../pi-extension"]}"#,
        );
        s.write("work/pi-extension/package.json", MANIFEST);
        assert!(s.installs());
        assert!(extension_args(Some(&s.path("pkg")), true).is_empty());
    }

    #[test]
    fn a_global_install_counts_too() {
        let s = Scratch::new("global");
        s.write(
            "home/.pi/agent/settings.json",
            r#"{"packages":[{"source":"~/copies/piary"}]}"#,
        );
        s.write("home/copies/piary/package.json", MANIFEST);
        assert!(s.installs());
    }

    #[test]
    fn a_moved_agent_dir_is_read_where_pi_reads_it() {
        let s = Scratch::new("moved");
        s.write("agent/settings.json", r#"{"packages":["npm:pi-ui-views"]}"#);
        let (work, home, agent) = (s.path("work"), s.path("home"), s.path("agent"));
        assert!(installs_piary(&work, Some(&agent), Some(&home)));
        assert!(!installs_piary(
            &work,
            Some(&home.join(".pi/agent")),
            Some(&home)
        ));
    }

    #[test]
    fn an_npm_source_is_matched_by_name() {
        let s = Scratch::new("npm");
        s.write(
            "work/.pi/settings.json",
            r#"{"packages":["npm:pi-ui-views@0.1.0"]}"#,
        );
        assert!(s.installs());
    }

    #[test]
    fn a_git_install_is_found_among_the_scopes_checkouts() {
        // The source does not name the package; its checkout's manifest does.
        let s = Scratch::new("git");
        s.write(
            "home/.pi/agent/settings.json",
            r#"{"packages":["git:github.com/someone/piary-tools"]}"#,
        );
        s.write(
            "home/.pi/agent/git/github.com/someone/piary-tools/package.json",
            MANIFEST,
        );
        assert!(s.installs());
    }

    #[test]
    fn a_git_install_of_something_else_is_not_it() {
        let s = Scratch::new("git-other");
        s.write(
            "work/.pi/settings.json",
            r#"{"packages":["https://github.com/x/y"]}"#,
        );
        s.write(
            "work/.pi/git/github.com/x/y/package.json",
            r#"{"name":"y"}"#,
        );
        assert!(!s.installs());
    }

    #[test]
    fn other_packages_and_broken_settings_install_nothing() {
        let s = Scratch::new("other");
        s.write(
            "home/.pi/agent/settings.json",
            r#"{"packages":["npm:@gotgenes/pi-anthropic-auth","./missing"]}"#,
        );
        s.write("work/.pi/settings.json", "{ not json");
        assert!(!s.installs());
    }

    #[test]
    fn with_no_home_only_the_workspace_is_read() {
        let s = Scratch::new("no-home");
        s.write(
            "work/.pi/settings.json",
            r#"{"packages":["~/copies/piary"]}"#,
        );
        assert!(!installs_piary(&s.path("work"), None, None));
    }

    #[test]
    fn the_prompt_is_appended_from_the_package() {
        let s = Scratch::new("prompt");
        let prompt = s.write("pkg/system-prompt.md", "be brief");
        assert_eq!(
            prompt_args(Some(&s.path("pkg")), false),
            vec![
                "--append-system-prompt".to_string(),
                prompt.to_string_lossy().into_owned()
            ]
        );
    }

    #[test]
    fn the_face_guidance_is_appended_after_the_prompt_only_when_the_face_is_on() {
        let s = Scratch::new("face-guidance");
        let prompt = s.write("pkg/system-prompt.md", "be brief");
        let face = s.write("pkg/face-guidance.md", "a message may end with a block");
        let flag = "--append-system-prompt".to_string();
        assert_eq!(
            prompt_args(Some(&s.path("pkg")), true),
            vec![
                flag.clone(),
                prompt.to_string_lossy().into_owned(),
                flag.clone(),
                face.to_string_lossy().into_owned()
            ]
        );
        assert_eq!(prompt_args(Some(&s.path("pkg")), false).len(), 2);
    }

    #[test]
    fn a_missing_face_guidance_passes_the_prompt_alone() {
        // As for the prompt: never a bare path, which pi would read as text.
        let s = Scratch::new("no-face-guidance");
        s.write("pkg/system-prompt.md", "be brief");
        assert_eq!(prompt_args(Some(&s.path("pkg")), true).len(), 2);
    }

    #[test]
    fn a_missing_prompt_file_passes_nothing() {
        // Never the bare path: pi would append the path string as prompt text.
        let s = Scratch::new("no-prompt");
        assert!(prompt_args(Some(&s.path("pkg")), true).is_empty());
        assert!(prompt_args(None, true).is_empty());
    }

    #[test]
    fn this_checkout_ships_the_prompt() {
        let dir = package_dir(None, Some(Path::new(env!("CARGO_MANIFEST_DIR"))));
        assert_eq!(prompt_args(dir.as_deref(), false).len(), 2);
    }

    #[test]
    fn this_checkout_ships_the_face_guidance() {
        let dir = package_dir(None, Some(Path::new(env!("CARGO_MANIFEST_DIR"))));
        assert_eq!(prompt_args(dir.as_deref(), true).len(), 4);
    }

    #[test]
    fn no_package_means_no_flag() {
        assert!(extension_args(None, false).is_empty());
    }
}
