//! Which pi extension packages one conversation loads.
//!
//! The packages are the ones pi's own settings install; this module adds only
//! the conversation's opt-outs. The app does not append to pi's transcript
//! (ADR 0021), so those live in a file of their own, as widget state does, and
//! a history rebuild cannot lose them. A conversation that turns nothing off
//! gets no flags at all, and pi's own discovery stands.
//!
//! No `tauri::` types (ADR 0014).

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::docs;
use crate::wire::ExtensionRow;

/// The package that is Piary's own: its `cell` tool is what the canvas runs on,
/// so it is listed but never offered to be turned off.
const OWN_PACKAGE: &str = "pi-ui-views";

/// Where to look: the project scope and pi's agent directory.
pub struct Scopes<'a> {
    pub cwd: &'a Path,
    pub agent: Option<&'a Path>,
}

struct Package {
    source: String,
    scope: &'static str,
    settings_dir: PathBuf,
    pinned_off: bool,
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

/// Installed packages across both settings scopes; the project wins a conflict.
fn catalog(scopes: &Scopes) -> Vec<Package> {
    let mut found: Vec<Package> = Vec::new();
    let project = scopes.cwd.join(".pi");
    let places = [
        ("global", scopes.agent.map(Path::to_path_buf)),
        ("project", Some(project)),
    ];
    for (scope, dir) in places {
        let Some(dir) = dir else { continue };
        let Some(settings) = read_json(&dir.join("settings.json")) else {
            continue;
        };
        let Some(packages) = settings["packages"].as_array() else {
            continue;
        };
        for entry in packages {
            let Some(source) = entry.as_str().or_else(|| entry["source"].as_str()) else {
                continue;
            };
            found.retain(|package| package.source != source);
            found.push(Package {
                source: source.to_string(),
                scope,
                settings_dir: dir.clone(),
                pinned_off: entry["autoload"] == Value::Bool(false),
            });
        }
    }
    found
}

/// Where a package could live: npm sources under the project's and then the
/// user's npm directory, anything else relative to the settings that named it.
fn roots(package: &Package, scopes: &Scopes) -> Vec<PathBuf> {
    match package.source.strip_prefix("npm:") {
        Some(name) => {
            let mut roots = vec![scopes.cwd.join(".pi/npm/node_modules").join(name)];
            roots.extend(
                scopes
                    .agent
                    .map(|agent| agent.join("npm/node_modules").join(name)),
            );
            roots
        }
        None => vec![package.settings_dir.join(&package.source)],
    }
}

fn is_module(path: &Path) -> bool {
    let name = path.to_string_lossy();
    let module = [".js", ".ts", ".mjs", ".cjs", ".mts", ".cts"]
        .iter()
        .any(|ext| name.ends_with(ext));
    module
        && ![".d.ts", ".d.mts", ".d.cts"]
            .iter()
            .any(|ext| name.ends_with(ext))
}

/// The modules one manifest entry names: a file, a directory with a manifest or
/// an index module, or with `discover` a directory of such children.
fn entry_files(path: &Path, discover: bool, seen: &mut BTreeSet<PathBuf>) -> Vec<PathBuf> {
    let Ok(real) = fs::canonicalize(path) else {
        return Vec::new();
    };
    if !seen.insert(real) {
        return Vec::new();
    }
    if path.is_file() {
        return if is_module(path) {
            vec![path.to_path_buf()]
        } else {
            Vec::new()
        };
    }
    if !path.is_dir() {
        return Vec::new();
    }
    let manifest = read_json(&path.join("package.json"));
    if let Some(entries) = manifest
        .as_ref()
        .and_then(|m| m["pi"]["extensions"].as_array())
    {
        return entries
            .iter()
            .filter_map(Value::as_str)
            .flat_map(|entry| entry_files(&path.join(entry), true, seen))
            .collect();
    }
    for name in ["index.ts", "index.js"] {
        let files = entry_files(&path.join(name), false, seen);
        if !files.is_empty() {
            return files;
        }
    }
    if !discover {
        return Vec::new();
    }
    let mut children: Vec<PathBuf> = fs::read_dir(path)
        .map(|dir| dir.flatten().map(|child| child.path()).collect())
        .unwrap_or_default();
    children.sort();
    children
        .iter()
        .flat_map(|child| entry_files(child, false, seen))
        .collect()
}

/// A package's extension modules: its manifest's, or pi's `extensions/` layout.
fn files(package: &Package, scopes: &Scopes) -> Vec<PathBuf> {
    for root in roots(package, scopes) {
        let manifest = read_json(&root.join("package.json"));
        if let Some(entries) = manifest
            .as_ref()
            .and_then(|m| m["pi"]["extensions"].as_array())
        {
            let mut seen = BTreeSet::new();
            return entries
                .iter()
                .filter_map(Value::as_str)
                .flat_map(|entry| entry_files(&root.join(entry), true, &mut seen))
                .collect();
        }
        let dir = root.join("extensions");
        if dir.exists() {
            return entry_files(&dir, true, &mut BTreeSet::new());
        }
    }
    Vec::new()
}

fn name_of(package: &Package, scopes: &Scopes) -> Option<String> {
    roots(package, scopes).iter().find_map(|root| {
        let name = read_json(&root.join("package.json"))?["name"]
            .as_str()?
            .to_string();
        Some(name.rsplit('/').next().unwrap_or(&name).to_string())
    })
}

/// Where one workspace's opt-outs live.
pub fn dir(app_data: &Path, workspace: &Path) -> PathBuf {
    app_data.join("extensions").join(docs::cwd_slug(workspace))
}

fn path_of(dir: &Path, id: &str) -> Result<PathBuf, String> {
    docs::check_id(id).map_err(|bad| bad.message().to_string())?;
    Ok(dir.join(format!("{id}.json")))
}

/// The sources this conversation turned off. No file, or one that cannot be
/// read, is none: every installed package loads, which is pi's default.
fn disabled(dir: &Path, id: &str) -> Result<BTreeSet<String>, String> {
    let path = path_of(dir, id)?;
    Ok(fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default())
}

/// The menu's rows for one conversation.
pub fn list(scopes: &Scopes, dir: &Path, id: &str) -> Result<Vec<ExtensionRow>, String> {
    let off = disabled(dir, id)?;
    Ok(catalog(scopes)
        .iter()
        .map(|package| {
            let name = name_of(package, scopes);
            ExtensionRow {
                source: package.source.clone(),
                own: name.as_deref() == Some(OWN_PACKAGE),
                name,
                scope: package.scope.to_string(),
                enabled: !off.contains(&package.source) && !package.pinned_off,
                pinned_off: package.pinned_off,
                files: u32::try_from(files(package, scopes).len()).unwrap_or(u32::MAX),
            }
        })
        .collect())
}

/// Turns one installed package on or off for one conversation. Refused for a
/// package nothing installs, and for Piary's own.
pub fn set(
    scopes: &Scopes,
    dir: &Path,
    id: &str,
    source: &str,
    enabled: bool,
) -> Result<Vec<ExtensionRow>, String> {
    let rows = list(scopes, dir, id)?;
    let Some(row) = rows.iter().find(|row| row.source == source) else {
        return Err(format!("{source} is not installed"));
    };
    if row.own {
        return Err("Piary's own extension stays on: the canvas runs on it".into());
    }
    let mut off = disabled(dir, id)?;
    if enabled {
        off.remove(source);
    } else {
        off.insert(source.to_string());
    }
    fs::create_dir_all(dir).map_err(|e| format!("creating the extensions directory: {e}"))?;
    let text = serde_json::to_string(&off).map_err(|e| e.to_string())?;
    docs::write_atomically(&path_of(dir, id)?, text)?;
    list(scopes, dir, id)
}

/// The start flags for one conversation: none when nothing is off, otherwise
/// pi's discovery off and every package still on named. pi still loads an
/// extension named explicitly, which is how Piary's own stays loaded.
pub fn args(scopes: &Scopes, dir: &Path, id: &str) -> Result<Vec<String>, String> {
    let off = disabled(dir, id)?;
    let installed = catalog(scopes);
    let is_off = |package: &Package| off.contains(&package.source) || package.pinned_off;
    if !installed.iter().any(is_off) {
        return Ok(Vec::new());
    }
    let mut flags = vec!["--no-extensions".to_string()];
    for package in installed.iter().filter(|package| !is_off(package)) {
        for file in files(package, scopes) {
            flags.push("--extension".into());
            flags.push(file.to_string_lossy().into_owned());
        }
    }
    Ok(flags)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("piary-extset-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
        fn write(&self, rel: &str, text: &str) {
            let path = self.0.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }
        fn store(&self) -> PathBuf {
            self.0.join("store")
        }
        /// Two npm packages in the agent scope; one is Piary's own.
        fn installed(&self) {
            self.write(
                "agent/settings.json",
                r#"{"packages":["npm:other","npm:@x/pi-ui-views"]}"#,
            );
            self.write(
                "agent/npm/node_modules/other/package.json",
                r#"{"name":"other","pi":{"extensions":["main.ts"]}}"#,
            );
            self.write("agent/npm/node_modules/other/main.ts", "");
            self.write(
                "agent/npm/node_modules/@x/pi-ui-views/package.json",
                r#"{"name":"@x/pi-ui-views","pi":{"extensions":["cell.ts"]}}"#,
            );
            self.write("agent/npm/node_modules/@x/pi-ui-views/cell.ts", "");
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn scopes(s: &Scratch) -> (PathBuf, PathBuf) {
        (s.0.join("work"), s.0.join("agent"))
    }

    #[test]
    fn the_menu_lists_what_pis_settings_install() {
        let s = Scratch::new("list");
        s.installed();
        let (cwd, agent) = scopes(&s);
        let rows = list(
            &Scopes {
                cwd: &cwd,
                agent: Some(&agent),
            },
            &s.store(),
            "doc",
        )
        .unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name.as_deref(), Some("other"));
        assert!(rows[0].enabled && !rows[0].own);
        assert_eq!(rows[0].files, 1);
        assert!(
            rows[1].own,
            "the scope is not part of the name it is known by"
        );
    }

    #[test]
    fn nothing_off_passes_no_flags() {
        let s = Scratch::new("none");
        s.installed();
        let (cwd, agent) = scopes(&s);
        assert!(args(
            &Scopes {
                cwd: &cwd,
                agent: Some(&agent)
            },
            &s.store(),
            "doc"
        )
        .unwrap()
        .is_empty());
    }

    #[test]
    fn a_package_turned_off_leaves_the_others_named() {
        let s = Scratch::new("off");
        s.installed();
        let (cwd, agent) = scopes(&s);
        let places = Scopes {
            cwd: &cwd,
            agent: Some(&agent),
        };
        set(&places, &s.store(), "doc", "npm:other", false).unwrap();
        let flags = args(&places, &s.store(), "doc").unwrap();
        assert_eq!(flags[0], "--no-extensions");
        assert!(flags.iter().any(|flag| flag.ends_with("cell.ts")));
        assert!(!flags.iter().any(|flag| flag.ends_with("main.ts")));
        assert!(!list(&places, &s.store(), "doc").unwrap()[0].enabled);
    }

    #[test]
    fn a_choice_belongs_to_one_conversation_and_can_be_undone() {
        let s = Scratch::new("per-doc");
        s.installed();
        let (cwd, agent) = scopes(&s);
        let places = Scopes {
            cwd: &cwd,
            agent: Some(&agent),
        };
        set(&places, &s.store(), "one", "npm:other", false).unwrap();
        assert!(list(&places, &s.store(), "two").unwrap()[0].enabled);
        set(&places, &s.store(), "one", "npm:other", true).unwrap();
        assert!(args(&places, &s.store(), "one").unwrap().is_empty());
    }

    #[test]
    fn piarys_own_package_and_an_unknown_one_are_refused() {
        let s = Scratch::new("refuse");
        s.installed();
        let (cwd, agent) = scopes(&s);
        let places = Scopes {
            cwd: &cwd,
            agent: Some(&agent),
        };
        assert!(set(&places, &s.store(), "doc", "npm:@x/pi-ui-views", false).is_err());
        assert!(set(&places, &s.store(), "doc", "npm:ghost", false).is_err());
    }

    #[test]
    fn a_package_settings_pin_off_is_off_everywhere() {
        let s = Scratch::new("pinned");
        s.installed();
        s.write(
            "agent/settings.json",
            r#"{"packages":[{"source":"npm:other","autoload":false},"npm:@x/pi-ui-views"]}"#,
        );
        let (cwd, agent) = scopes(&s);
        let places = Scopes {
            cwd: &cwd,
            agent: Some(&agent),
        };
        assert!(list(&places, &s.store(), "doc").unwrap()[0].pinned_off);
        assert_eq!(
            args(&places, &s.store(), "doc").unwrap()[0],
            "--no-extensions"
        );
    }

    #[test]
    fn a_bad_conversation_id_is_refused() {
        let s = Scratch::new("bad-id");
        s.installed();
        let (cwd, agent) = scopes(&s);
        let places = Scopes {
            cwd: &cwd,
            agent: Some(&agent),
        };
        assert!(set(&places, &s.store(), "../up", "npm:other", false).is_err());
    }
}
