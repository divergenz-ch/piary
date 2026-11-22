//! The native menu bar.
//!
//! Two rules it answers to. **Every verb here is also reachable without the
//! keyboard** — the menu item IS that route, which is why a chord in
//! `src/document/keymap.ts` may appear here but a menu item need not have one.
//! And **the menu does not act**: each item emits an event the page handles, so
//! one implementation of a verb serves both routes and the two cannot drift.
//! Quit is the one exception, because it is the app's verb and not a page's: it
//! requests the exit, and the exit sequence asks every page (ADR 0019 §2).
//! Settings… goes to the focused page like any verb, and is acted on here only
//! when no window is focused to hear it (ADR 0048).
//!
//! The menu is also read back, as plain rows (`registered`): the key an item
//! really has is the system's to say, and `menu_keys.rs` pairs these rows with
//! the system's own to name it (ADR 0051).

use tauri::menu::{AboutMetadata, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use crate::menu_keys::Registered;
use crate::windows::Transfer;

/// The event a menu item emits. The page listens for one name and switches on
/// the id, so adding an item needs no new channel.
pub const MENU_EVENT: &str = "menu";

/// Every verb the menu offers, as the ids the page switches on.
///
/// Named here rather than inline so the page's handler and the menu cannot
/// disagree about a spelling — the generated wire types do the same job for
/// payloads.
pub mod ids {
    pub const NEW_DOCUMENT: &str = "new-document";
    pub const OPEN_DOCUMENT: &str = "open-document";
    pub const IMPORT: &str = "import";
    pub const EXPORT: &str = "export";
    pub const SAVE: &str = "save";
    pub const SEND: &str = "send";
    pub const STOP: &str = "stop";
    pub const NEW_TERMINAL: &str = "new-terminal";
    pub const TOGGLE_SOURCE: &str = "toggle-source";
    pub const TOGGLE_FOCUS: &str = "toggle-focus";
    pub const CHOOSE_MODEL: &str = "choose-model";
    pub const CHOOSE_EFFORT: &str = "choose-effort";
    pub const COMMANDS: &str = "commands";
    pub const TOGGLE_FACE: &str = "toggle-face";
    pub const WELCOME: &str = "welcome";
    pub const CHECK_UPDATES: &str = "check-updates";
    pub const SETTINGS: &str = "settings";
    pub const QUIT: &str = "quit";
}

/// Builds the menu bar and installs the handler that forwards its events.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            // The accelerators repeat what the keymap table already binds in the
            // page. They are here because macOS draws them in the menu and
            // because a menu with no accelerator teaches the user nothing — not
            // as a second source of truth: the page's handler is one path for
            // both routes.
            &MenuItem::with_id(
                app,
                ids::NEW_DOCUMENT,
                "New Document",
                true,
                Some("CmdOrCtrl+N"),
            )?,
            &MenuItem::with_id(app, ids::OPEN_DOCUMENT, "Open…", true, Some("CmdOrCtrl+O"))?,
            &PredefinedMenuItem::separator(app)?,
            // No chord: each opens a window of its own, and the two are not
            // reached often enough to spend one.
            &MenuItem::with_id(app, ids::IMPORT, "Import…", true, None::<&str>)?,
            &MenuItem::with_id(app, ids::EXPORT, "Export…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, ids::SAVE, "Save", true, Some("CmdOrCtrl+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    // The predefined items are deliberate: macOS expects the system's own
    // Undo/Cut/Copy/Paste in Edit, and a hand-rolled copy would not reach the
    // webview's native selection.
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    // A plain item rather than a checked one: the state is the page's, kept
    // in its own storage, and a checkmark would need Rust to hold it too. The
    // page binds no key for it: the accelerator is claimed before the webview
    // sees the key, so it is the chord.
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[&MenuItem::with_id(
            app,
            ids::TOGGLE_FOCUS,
            "Focus Mode",
            true,
            Some("CmdOrCtrl+Shift+F"),
        )?],
    )?;

    let conversation = Submenu::with_items(
        app,
        "Conversation",
        true,
        &[
            // No accelerator, though ⌘⏎ is the send chord: the page binds it
            // per context (a cell's ⌘⏎ runs the cell), and a key equivalent the
            // menu might take first would turn every ⌘⏎ into this item. The
            // item is the chord's mouse route.
            &MenuItem::with_id(app, ids::SEND, "Send", true, None::<&str>)?,
            // Not Escape, though Escape stops a turn in the page: a menu key
            // equivalent with no modifier is claimed before the webview sees
            // the key, and Escape also closes a popover and is how a terminal
            // program leaves insert mode. ⌘. is the macOS cancel chord.
            &MenuItem::with_id(app, ids::STOP, "Stop", true, Some("CmdOrCtrl+Period"))?,
            &PredefinedMenuItem::separator(app)?,
            // Every `/` command, from wherever the caret is. ⌘K is the chord
            // other tools give their command list; the page binds no key for it.
            &MenuItem::with_id(app, ids::COMMANDS, "Commands…", true, Some("CmdOrCtrl+K"))?,
            &MenuItem::with_id(app, ids::NEW_TERMINAL, "New Terminal", true, None::<&str>)?,
            &MenuItem::with_id(app, ids::TOGGLE_SOURCE, "Show Source", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            // Claude Code's chords for the same two pickers. They open the model
            // chip's menus rather than step through them. Neither is bound in the
            // page's keymap; the cost is that ⌥P and ⌥T no longer type π and †.
            &MenuItem::with_id(app, ids::CHOOSE_MODEL, "Model…", true, Some("Alt+P"))?,
            &MenuItem::with_id(app, ids::CHOOSE_EFFORT, "Effort…", true, Some("Alt+T"))?,
            // A plain item, as Focus Mode is: whether the face is read is a
            // preference the pages follow, and the pill beside the model says it.
            // Its chord is the one way to stop a message carrying the face from
            // the keyboard: a switch that stays where it is put, as Caps Lock
            // does, and no opt-out for one message (ADR 0059).
            &MenuItem::with_id(
                app,
                ids::TOGGLE_FACE,
                "Read My Face",
                true,
                Some("Alt+CmdOrCtrl+F"),
            )?,
        ],
    )?;

    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    // A fresh copy of the first-run tour, as a new conversation: the stored
    // `welcome` is the user's own by now, and is never overwritten (ADR 0037).
    // Last in the bar, and titled Help, so macOS gives it its search field.
    let help = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &MenuItem::with_id(app, ids::WELCOME, "Welcome to Piary", true, None::<&str>)?,
            // Asks now, whatever the hour and the preference say: the user
            // asked (ADR 0064).
            &MenuItem::with_id(
                app,
                ids::CHECK_UPDATES,
                "Check for Updates…",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            // The app menu has to come first on macOS: whatever is first is
            // drawn under the application's name.
            &Submenu::with_items(
                app,
                "Piary",
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(AboutMetadata::default()))?,
                    &PredefinedMenuItem::separator(app)?,
                    // ⌘, under the app's name, where macOS keeps it.
                    &MenuItem::with_id(
                        app,
                        ids::SETTINGS,
                        "Settings…",
                        true,
                        Some("CmdOrCtrl+Comma"),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    // Not `PredefinedMenuItem::quit`: that sends `terminate:`,
                    // which on macOS reaches only `RunEvent::Exit` — too late to
                    // ask a page anything. This one requests the exit, so ⌘Q
                    // enters the sequence that flushes first (ADR 0019 §2).
                    &MenuItem::with_id(app, ids::QUIT, "Quit Piary", true, Some("CmdOrCtrl+Q"))?,
                ],
            )?,
            &file,
            &edit,
            &view,
            &conversation,
            &window,
            &help,
        ],
    )?;

    app.set_menu(menu)?;

    // Forwarded, not acted on: the page owns every verb, so the menu and the
    // keyboard reach one implementation. Quit is the app's, and requests the
    // exit that `RunEvent::ExitRequested` turns into the sequence.
    app.on_menu_event(move |app, event| {
        if event.id().0 == ids::QUIT {
            app.exit(0);
            return;
        }
        let windows: Vec<_> = app.webview_windows().into_values().collect();
        let focused = windows
            .iter()
            .map(|w| (w.label(), w.is_focused().unwrap_or(false)));
        match heard(event.id().0.as_str(), target(focused)) {
            Heard::By(label) => {
                let _ = app.emit_to(
                    EventTarget::webview_window(label),
                    MENU_EVENT,
                    event.id().0.clone(),
                );
            }
            // Off this thread, which is the main one: a window is built
            // through it.
            Heard::OpenPreferences => {
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = crate::commands::show_preferences(&app) {
                        crate::diag::note(&format!("piary: {e}"));
                    }
                });
            }
            Heard::OpenTransfer(window) => {
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = crate::commands::show_transfer(&app, window, None) {
                        crate::diag::note(&format!("piary: {e}"));
                    }
                });
            }
            Heard::ByNobody => {}
        }
    });
    Ok(())
}

/// The menu as it was installed, submenu by submenu: each item that emits an
/// id, with its title, at its position. Anything that cannot be read is left
/// out as an empty row or a `None`, which costs the item its chord and nothing
/// else.
pub fn registered<R: Runtime>(app: &AppHandle<R>) -> Vec<Vec<Registered>> {
    let Some(tops) = app.menu().and_then(|menu| menu.items().ok()) else {
        return Vec::new();
    };
    tops.iter()
        .map(|top| {
            let items = top.as_submenu().and_then(|submenu| submenu.items().ok());
            items
                .unwrap_or_default()
                .iter()
                .map(|item| match item {
                    MenuItemKind::MenuItem(item) => {
                        item.text().ok().map(|title| (item.id().0.clone(), title))
                    }
                    _ => None,
                })
                .collect()
        })
        .collect()
}

/// What becomes of a menu click.
#[derive(Debug, PartialEq, Eq)]
enum Heard<'a> {
    /// The focused window's page answers it.
    By(&'a str),
    /// Rust shows the Preferences window itself.
    OpenPreferences,
    /// Rust shows the Import or the Export window itself.
    OpenTransfer(Transfer),
    ByNobody,
}

/// Who answers a click on `id`, given the window `target` found.
///
/// Settings…, Import… and Export… need no window to act in: each opens its
/// own, so with none focused Rust opens it rather than letting the item do
/// nothing.
fn heard<'a>(id: &str, focused: Option<&'a str>) -> Heard<'a> {
    match focused {
        Some(label) => Heard::By(label),
        None if id == ids::SETTINGS => Heard::OpenPreferences,
        None if id == ids::IMPORT => Heard::OpenTransfer(Transfer::Import),
        None if id == ids::EXPORT => Heard::OpenTransfer(Transfer::Export),
        None => Heard::ByNobody,
    }
}

/// The window a menu click is for: the focused one.
///
/// Each window is a document (ADR 0027), so a click acts in one of them, never
/// all. With none focused — every window minimised — the click goes nowhere: a
/// verb acting on a window the user cannot see is worse than nothing.
fn target<'a>(windows: impl IntoIterator<Item = (&'a str, bool)>) -> Option<&'a str> {
    windows
        .into_iter()
        .find(|(_, focused)| *focused)
        .map(|(label, _)| label)
}

#[cfg(test)]
mod tests {
    use super::{heard, ids, target, Heard, Transfer};

    #[test]
    fn a_click_goes_to_the_focused_window() {
        let windows = [("main", false), ("doc-notes", true), ("doc-child", false)];
        assert_eq!(target(windows), Some("doc-notes"));
    }

    #[test]
    fn a_click_with_no_window_focused_goes_nowhere() {
        assert_eq!(target([("main", false), ("doc-notes", false)]), None);
        assert_eq!(target([]), None);
    }

    #[test]
    fn settings_opens_with_no_window_focused_and_is_the_pages_otherwise() {
        assert_eq!(heard(ids::SETTINGS, Some("main")), Heard::By("main"));
        assert_eq!(heard(ids::SETTINGS, None), Heard::OpenPreferences);
        assert_eq!(heard(ids::IMPORT, Some("main")), Heard::By("main"));
        assert_eq!(
            heard(ids::IMPORT, None),
            Heard::OpenTransfer(Transfer::Import)
        );
        assert_eq!(
            heard(ids::EXPORT, None),
            Heard::OpenTransfer(Transfer::Export)
        );
        // The pair: any other verb with no window focused still goes nowhere.
        assert_eq!(heard(ids::SEND, None), Heard::ByNobody);
    }

    #[test]
    fn every_id_is_distinct() {
        // Two items sharing an id would make the page's handler ambiguous, and
        // which one won would depend on the order they were built in.
        let all = [
            ids::NEW_DOCUMENT,
            ids::OPEN_DOCUMENT,
            ids::IMPORT,
            ids::EXPORT,
            ids::SAVE,
            ids::SEND,
            ids::STOP,
            ids::NEW_TERMINAL,
            ids::TOGGLE_SOURCE,
            ids::TOGGLE_FOCUS,
            ids::CHOOSE_MODEL,
            ids::CHOOSE_EFFORT,
            ids::WELCOME,
            ids::CHECK_UPDATES,
            ids::SETTINGS,
            ids::QUIT,
        ];
        let mut seen: Vec<&str> = all.to_vec();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), all.len(), "a menu id is used twice");
    }

    #[test]
    fn ids_are_stable_kebab_case() {
        // The page switches on these strings. A rename is a breaking change to
        // the page, so the shape is pinned here where it is cheap to notice.
        for id in [ids::NEW_DOCUMENT, ids::TOGGLE_SOURCE, ids::NEW_TERMINAL] {
            assert!(
                id.chars().all(|c| c.is_ascii_lowercase() || c == '-'),
                "{id} is not kebab-case"
            );
        }
    }
}
