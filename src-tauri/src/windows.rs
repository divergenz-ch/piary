//! Window geometry across launches, and the labels that identify a window.
//!
//! Pure: the geometry arithmetic and the label grammar are functions of their
//! arguments, so `cargo test` covers the parts that are easy to get wrong
//! without opening a window (ADR 0014). The Tauri calls live in `commands.rs`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Where a window was and how big, as persisted between launches.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// The smallest window worth restoring to.
///
/// A window saved while minimised, or on a display that has since gone, can
/// come back a few pixels across — technically visible, impossible to grab.
pub const MIN_WIDTH: u32 = 480;
pub const MIN_HEIGHT: u32 = 360;

impl Geometry {
    /// The geometry a window should actually open at.
    ///
    /// Clamps to a usable size, and refuses a position entirely off every
    /// screen: a window restored onto a disconnected display is invisible and
    /// looks like a crash.
    pub fn usable(self, screens: &[(i32, i32, u32, u32)]) -> Geometry {
        let width = self.width.max(MIN_WIDTH);
        let height = self.height.max(MIN_HEIGHT);
        // Visible means enough of the title bar is on some screen to grab. A
        // window may legitimately overhang an edge, so this is an overlap test
        // rather than full containment.
        let visible = screens.iter().any(|&(sx, sy, sw, sh)| {
            let (right, bottom) = (sx + sw as i32, sy + sh as i32);
            self.x < right
                && self.y < bottom
                && self.x + width as i32 > sx
                && self.y + height as i32 > sy
        });
        if visible {
            return Geometry {
                width,
                height,
                ..self
            };
        }
        // Fall back to the first screen's origin rather than to (0,0), which on
        // a multi-display Mac can itself be off-screen.
        let (x, y) = screens
            .first()
            .map(|&(sx, sy, _, _)| (sx, sy))
            .unwrap_or((0, 0));
        Geometry {
            x,
            y,
            width,
            height,
        }
    }
}

/// Every window's geometry, by label.
pub type Layout = HashMap<String, Geometry>;

/// Where the layout is kept: beside the app's other state, not beside the
/// documents — a window position is this machine's business and must never be
/// committed with a repo's conversations.
pub fn layout_path(app_data: &Path) -> PathBuf {
    app_data.join("windows.json")
}

/// Reads the saved layout. A missing or unreadable file is an empty layout, not
/// an error: losing window positions must never stop the app from opening.
pub fn read_layout(path: &Path) -> Layout {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Writes the layout, creating its directory.
pub fn write_layout(path: &Path, layout: &Layout) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("creating the app data directory: {e}"))?;
    }
    let text = serde_json::to_string_pretty(layout).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| format!("writing the window layout: {e}"))
}

/// The label for the window showing `doc_id`.
///
/// One window per document, found by label, which is how opening the same
/// document twice focuses the existing window instead of making a second one
/// that would fight it for writes.
pub fn label_for(doc_id: &str) -> String {
    // Tauri labels allow alphanumerics, `-`, `/`, `:` and `_`. A document id is
    // already one path segment (`docs::check_id`), but it may contain a dot,
    // which a label may not.
    let safe: String = doc_id
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_') {
                c
            } else {
                '-'
            }
        })
        .collect();
    format!("doc-{safe}")
}

/// The page a document's window loads: the app's own page, told which
/// document by `?id=`. Percent-encoded, though `docs::check_id` already keeps
/// an id to one plain segment: the URL is built here and nowhere else.
pub fn url_for(doc_id: &str) -> String {
    format!("index.html?id={}", encoded(doc_id))
}

/// `text` as a URL's query value.
fn encoded(text: &str) -> String {
    let mut encoded = String::new();
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

/// What an Export window already open hears when an export is asked for
/// again, with the conversation it is asked for.
pub const EXPORT_FROM_EVENT: &str = "export-from";

/// The two windows a conversation is brought in or taken out through
/// (ADR 0049). One of each for the app, like the Preferences window: asking
/// again focuses the one there is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transfer {
    Import,
    Export,
}

impl Transfer {
    /// The window the page or the menu names, or why it names none.
    pub fn named(name: &str) -> Result<Self, String> {
        match name {
            "import" => Ok(Transfer::Import),
            "export" => Ok(Transfer::Export),
            other => Err(format!(
                "{other:?} is neither the import nor the export window"
            )),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Transfer::Import => "import",
            Transfer::Export => "export",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Transfer::Import => "Import",
            Transfer::Export => "Export",
        }
    }

    /// The page the window loads. The Export window is told which
    /// conversation was in front, to open with it chosen; an import has no
    /// conversation yet.
    pub fn url(self, from: Option<&str>) -> String {
        match (self, from) {
            (Transfer::Export, Some(id)) => format!("export.html?from={}", encoded(id)),
            (Transfer::Export, None) => "export.html".into(),
            (Transfer::Import, _) => "import.html".into(),
        }
    }

    /// A form's size, fixed: the Export window is the taller, for its list.
    pub fn size(self) -> (f64, f64) {
        match self {
            Transfer::Import => (520.0, 360.0),
            Transfer::Export => (520.0, 560.0),
        }
    }
}

/// Which document each window shows, by window label.
///
/// A window's label names the document it was opened for, but a window
/// switches among documents (the conversation list), so the label alone cannot
/// say which window shows a document now. The page reports what it shows each
/// time it boots, and one editor per file is kept by asking here.
#[derive(Debug, Default)]
pub struct Shown {
    by_window: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

impl Shown {
    /// `window` now shows `doc_id`.
    pub fn show(&self, window: &str, doc_id: &str) {
        self.by_window
            .lock()
            .unwrap()
            .insert(window.to_string(), doc_id.to_string());
    }

    /// The window showing `doc_id`, if any.
    pub fn window_for(&self, doc_id: &str) -> Option<String> {
        self.by_window
            .lock()
            .unwrap()
            .iter()
            .find(|(_, shown)| shown.as_str() == doc_id)
            .map(|(window, _)| window.clone())
    }

    /// `window` is gone.
    pub fn forget(&self, window: &str) {
        self.by_window.lock().unwrap().remove(window);
    }
}

/// A label for a new window for `doc_id` that no live window holds: the
/// document's own, or that with a counter when a window that switched away
/// still carries it.
pub fn free_label_for(doc_id: &str, taken: &dyn Fn(&str) -> bool) -> String {
    let label = label_for(doc_id);
    if !taken(&label) {
        return label;
    }
    (2..)
        .map(|n| format!("{label}-{n}"))
        .find(|candidate| !taken(candidate))
        .expect("an unbounded counter finds a free label")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_transfer_windows_are_named_and_load_their_own_pages() {
        assert_eq!(Transfer::named("import"), Ok(Transfer::Import));
        assert_eq!(Transfer::named("export"), Ok(Transfer::Export));
        assert!(Transfer::named("preferences").is_err());
        assert_ne!(Transfer::Import.label(), Transfer::Export.label());
        assert_eq!(Transfer::Import.url(Some("notes")), "import.html");
        assert_eq!(Transfer::Export.url(None), "export.html");
        // The conversation in front is a query value, whatever its name holds.
        assert_eq!(
            Transfer::Export.url(Some("trip & notes")),
            "export.html?from=trip%20%26%20notes"
        );
    }

    const SCREEN: (i32, i32, u32, u32) = (0, 0, 1920, 1080);

    #[test]
    fn a_window_on_screen_keeps_its_place() {
        let saved = Geometry {
            x: 100,
            y: 80,
            width: 1000,
            height: 700,
        };
        assert_eq!(saved.usable(&[SCREEN]), saved);
    }

    #[test]
    fn a_window_overhanging_an_edge_is_left_alone() {
        // Legitimate: a user drags a window half off the right edge and expects
        // it back where they left it.
        let saved = Geometry {
            x: 1800,
            y: 80,
            width: 1000,
            height: 700,
        };
        assert_eq!(saved.usable(&[SCREEN]), saved);
    }

    #[test]
    fn a_window_on_a_display_that_is_gone_comes_home() {
        // The failure this exists for: a laptop undocked since the last launch
        // restores its window onto a screen that is not there, and the app looks
        // like it failed to start.
        let saved = Geometry {
            x: 3000,
            y: 200,
            width: 1000,
            height: 700,
        };
        let fixed = saved.usable(&[SCREEN]);
        assert_eq!(fixed.x, 0);
        assert_eq!(fixed.y, 0);
        // The size is still the user's.
        assert_eq!((fixed.width, fixed.height), (1000, 700));
    }

    #[test]
    fn a_second_display_is_a_place_a_window_may_live() {
        let right = (1920, 0, 1920, 1080);
        let saved = Geometry {
            x: 2400,
            y: 100,
            width: 800,
            height: 600,
        };
        assert_eq!(saved.usable(&[SCREEN, right]), saved);
    }

    #[test]
    fn a_window_returns_to_the_first_screens_origin_not_to_zero() {
        // On a Mac whose menu-bar display sits to the right, (0,0) is itself
        // off-screen, so "come home" has to mean a real screen's origin.
        let only = (-1920, -200, 1920, 1080);
        let saved = Geometry {
            x: 5000,
            y: 5000,
            width: 800,
            height: 600,
        };
        let fixed = saved.usable(&[only]);
        assert_eq!((fixed.x, fixed.y), (-1920, -200));
    }

    #[test]
    fn an_unusably_small_window_is_grown() {
        let saved = Geometry {
            x: 10,
            y: 10,
            width: 20,
            height: 12,
        };
        let fixed = saved.usable(&[SCREEN]);
        assert_eq!((fixed.width, fixed.height), (MIN_WIDTH, MIN_HEIGHT));
    }

    #[test]
    fn with_no_screens_at_all_the_geometry_is_still_usable() {
        // Nothing should make opening a window impossible.
        let saved = Geometry {
            x: 500,
            y: 500,
            width: 100,
            height: 100,
        };
        let fixed = saved.usable(&[]);
        assert_eq!((fixed.x, fixed.y), (0, 0));
        assert_eq!((fixed.width, fixed.height), (MIN_WIDTH, MIN_HEIGHT));
    }

    #[test]
    fn a_label_is_derived_from_the_document_and_is_stable() {
        assert_eq!(label_for("abc123"), "doc-abc123");
        assert_eq!(label_for("web-landing"), "doc-web-landing");
        // Same input, same label — which is what makes "focus the existing
        // window" work instead of opening a second one.
        assert_eq!(label_for("abc123"), label_for("abc123"));
    }

    #[test]
    fn a_label_drops_what_tauri_will_not_accept() {
        // A document id may contain a dot; a window label may not.
        assert_eq!(label_for("notes.v2"), "doc-notes-v2");
    }

    #[test]
    fn a_document_window_loads_the_app_page_told_its_id() {
        assert_eq!(url_for("web-1a2b3c4d"), "index.html?id=web-1a2b3c4d");
        assert_eq!(url_for("notes.v2"), "index.html?id=notes.v2");
    }

    #[test]
    fn an_id_that_would_break_the_query_is_encoded() {
        assert_eq!(url_for("a b&c=d#e"), "index.html?id=a%20b%26c%3Dd%23e");
        assert_eq!(url_for("é"), "index.html?id=%C3%A9");
    }

    #[test]
    fn a_window_shows_one_document_and_switching_moves_it() {
        let shown = Shown::default();
        shown.show("main", "welcome");
        assert_eq!(shown.window_for("welcome").as_deref(), Some("main"));
        shown.show("main", "web-1");
        assert_eq!(shown.window_for("web-1").as_deref(), Some("main"));
        assert_eq!(shown.window_for("welcome"), None, "the window left it");
    }

    #[test]
    fn a_window_that_is_gone_shows_nothing() {
        let shown = Shown::default();
        shown.show("doc-a", "a");
        shown.show("main", "b");
        shown.forget("doc-a");
        assert_eq!(shown.window_for("a"), None);
        // The pair: another window's document is still known.
        assert_eq!(shown.window_for("b").as_deref(), Some("main"));
    }

    #[test]
    fn a_new_window_gets_a_label_no_live_window_holds() {
        assert_eq!(free_label_for("web-1", &|_| false), "doc-web-1");
        let taken = |label: &str| label == "doc-web-1" || label == "doc-web-1-2";
        assert_eq!(free_label_for("web-1", &taken), "doc-web-1-3");
    }

    #[test]
    fn a_missing_layout_file_is_empty_rather_than_fatal() {
        let path = std::env::temp_dir().join("piary-no-such-layout.json");
        let _ = std::fs::remove_file(&path);
        assert!(read_layout(&path).is_empty());
    }

    #[test]
    fn a_corrupt_layout_file_is_empty_rather_than_fatal() {
        // Losing window positions is a nuisance; refusing to open is not
        // acceptable, so a damaged file reads as "no saved layout".
        let path = std::env::temp_dir().join(format!("piary-corrupt-{}.json", std::process::id()));
        std::fs::write(&path, "{not json").unwrap();
        assert!(read_layout(&path).is_empty());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_layout_round_trips() {
        let dir = std::env::temp_dir().join(format!("piary-layout-{}", std::process::id()));
        let path = layout_path(&dir);
        let mut layout = Layout::new();
        layout.insert(
            "doc-a".into(),
            Geometry {
                x: 1,
                y: 2,
                width: 800,
                height: 600,
            },
        );
        write_layout(&path, &layout).expect("write");
        assert_eq!(read_layout(&path), layout);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_layout_lives_beside_app_state_and_not_beside_documents() {
        // A window position is this machine's business. Writing it next to the
        // conversations would put it in a repo that opted into `pi-docs/`.
        let path = layout_path(Path::new("/home/me/Library/Application Support/piary"));
        assert!(path.ends_with("windows.json"));
        assert!(!path.to_string_lossy().contains("pi-docs"));
    }
}
