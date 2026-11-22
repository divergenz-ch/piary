//! What the user chose about how the app behaves, kept across launches
//! (ADR 0048).
//!
//! One JSON file for the app, not one per workspace or document: a preference
//! is the user's, wherever they work. It holds Piary's own behaviour only; what
//! pi decides — its default model, its thinking level — stays in pi's settings.
//!
//! A file that is missing, unreadable or malformed reads as the defaults, and a
//! key the file lacks reads as its default (`wire::Preferences`), so a file
//! written before a preference existed is still whole.
//!
//! No `tauri::` types (ADR 0014).

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use crate::docs;
use crate::wire::Preferences;

/// Names the preferences file, instead of the one in the app's config
/// directory: how a driven run keeps its own, and leaves the user's alone.
pub const FILE_ENV: &str = "PIARY_PREFERENCES";

/// The label of the one Preferences window, and the page it loads.
pub const WINDOW_LABEL: &str = "preferences";
pub const WINDOW_PAGE: &str = "preferences.html";

/// The event every window hears when a preference changed, with them all.
pub const CHANGED_EVENT: &str = "preferences-changed";

/// Where the preferences are kept: `named` when the environment names a file,
/// else `preferences.json` in the app's config directory.
pub fn path(named: Option<OsString>, config_dir: &Path) -> PathBuf {
    match named {
        Some(file) if !file.is_empty() => PathBuf::from(file),
        _ => config_dir.join("preferences.json"),
    }
}

/// The preferences as kept, or the defaults.
pub fn read(path: &Path) -> Preferences {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Keeps `preferences`, atomically, creating the file's directory.
pub fn write(path: &Path, preferences: &Preferences) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("creating the preferences directory: {e}"))?;
    }
    let text = serde_json::to_string_pretty(preferences)
        .map_err(|e| format!("writing the preferences: {e}"))?;
    docs::write_atomically(path, format!("{text}\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::FaceReading;

    /// A directory under the OS temp dir, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("piary-preferences-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn no_file_reads_as_the_defaults() {
        let scratch = Scratch::new("absent");
        assert_eq!(
            read(&scratch.0.join("preferences.json")),
            Preferences::default()
        );
    }

    #[test]
    fn what_was_written_is_what_is_read() {
        let scratch = Scratch::new("round-trip");
        // A directory that does not exist yet: the first write on a new machine.
        let file = scratch.0.join("config").join("preferences.json");
        let chosen = Preferences {
            cell_work_pulse: !Preferences::default().cell_work_pulse,
            face: !Preferences::default().face,
            face_explained: !Preferences::default().face_explained,
            face_camera: "FaceTime HD Camera".into(),
            face_tuning: FaceReading {
                intensity: "B".into(),
                min_ms: 300,
                yaw: 18,
                pitch: 15,
            },
            face_speaks: !Preferences::default().face_speaks,
            update_check: !Preferences::default().update_check,
            update_dismissed: "0.2.0".into(),
        };
        write(&file, &chosen).expect("write");
        assert_eq!(read(&file), chosen);
    }

    #[test]
    fn a_file_that_is_not_preferences_reads_as_the_defaults() {
        let scratch = Scratch::new("malformed");
        let file = scratch.0.join("preferences.json");
        for text in ["", "not json", "[1, 2]", r#"{"cellWorkPulse": "yes"}"#] {
            fs::write(&file, text).expect("seed");
            assert_eq!(read(&file), Preferences::default(), "for {text:?}");
        }
    }

    #[test]
    fn a_key_the_file_lacks_reads_as_its_default() {
        // A file an older Piary wrote, before a preference existed, and one a
        // newer Piary wrote, with a key this one does not know.
        let scratch = Scratch::new("partial");
        let file = scratch.0.join("preferences.json");
        fs::write(&file, "{}").expect("seed");
        assert_eq!(read(&file), Preferences::default());
        fs::write(&file, r#"{"cellWorkPulse": false, "later": 3}"#).expect("seed");
        assert_eq!(
            read(&file),
            Preferences {
                cell_work_pulse: false,
                ..Preferences::default()
            }
        );
    }

    #[test]
    fn the_environment_names_another_file() {
        let config = Path::new("/config/piary");
        assert_eq!(path(None, config), config.join("preferences.json"));
        assert_eq!(
            path(Some("/elsewhere/prefs.json".into()), config),
            Path::new("/elsewhere/prefs.json")
        );
        // Set and empty is not a file.
        assert_eq!(
            path(Some(OsString::new()), config),
            config.join("preferences.json")
        );
    }
}
