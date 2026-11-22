//! The menu bar's key equivalents, read back from the system.
//!
//! macOS moves a menu shortcut to another key when the keyboard layout calls
//! for it (`⌘,` is `⌘Ö` on a Turkish one), draws the moved key in the menu bar
//! and tells the app nothing. The menu item itself holds the key in use, so a
//! surface that names a shortcut outside the menu bar asks here rather than
//! repeating what was registered (ADR 0051).
//!
//! Tauri gives no handle to a native item and the native item carries no id,
//! so the two menus are paired by position: an item is added to the system's
//! menu in the order the app's menu lists it. A pair is trusted only when its
//! two titles are equal, and an item this cannot be sure of has no chord: a
//! missing shortcut is a smaller fault than a wrong one.

use std::collections::BTreeMap;

use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSEventModifierFlags, NSMenu};

/// The modifiers of a key equivalent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Modifiers {
    pub control: bool,
    pub option: bool,
    pub shift: bool,
    pub command: bool,
}

/// One item of the system's menu, as AppKit holds it now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Held {
    pub title: String,
    pub key: String,
    pub modifiers: Modifiers,
}

/// One item of the app's menu: the id its click emits, and its title. A
/// separator or a predefined item is `None`, so positions still line up.
pub type Registered = Option<(String, String)>;

/// A chord as the menu bar draws it: `⌃⌥⇧⌘` in that order, then the key in
/// capitals. `None` for no key, and for a key that is not one printable
/// character.
pub fn label(key: &str, modifiers: Modifiers) -> Option<String> {
    let mut chars = key.chars();
    let (Some(c), None) = (chars.next(), chars.next()) else {
        return None;
    };
    // AppKit names an arrow or a function key by a private-use character.
    if c.is_control() || c.is_whitespace() || ('\u{E000}'..='\u{F8FF}').contains(&c) {
        return None;
    }
    // An upper-case letter as the key is AppKit's way of asking for Shift.
    let shift = modifiers.shift || (c.is_uppercase() && c.to_lowercase().next() != Some(c));
    // `to_uppercase` knows no locale, which is what the menu bar draws: `i`
    // is `I` on a Turkish layout too. A letter with no single capital (`ß`)
    // stays as it is.
    let mut upper = c.to_uppercase();
    let drawn = match (upper.next(), upper.next()) {
        (Some(u), None) => u,
        _ => c,
    };
    let mut out = String::new();
    for (held, glyph) in [
        (modifiers.control, '⌃'),
        (modifiers.option, '⌥'),
        (shift, '⇧'),
        (modifiers.command, '⌘'),
    ] {
        if held {
            out.push(glyph);
        }
    }
    out.push(drawn);
    Some(out)
}

/// The chord of every registered item that has one, by its id.
pub fn chords(registered: &[Vec<Registered>], held: &[Vec<Held>]) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for (ours, theirs) in registered.iter().zip(held) {
        for (item, native) in ours.iter().zip(theirs) {
            let Some((id, title)) = item else { continue };
            if *title != native.title {
                continue;
            }
            if let Some(chord) = label(&native.key, native.modifiers) {
                out.insert(id.clone(), chord);
            }
        }
    }
    out
}

/// The main menu's items as AppKit holds them now, submenu by submenu.
///
/// Not to be read in the call that installs the menu: the system moves a key
/// a turn of the run loop after the item joins a menu.
pub fn held(mtm: MainThreadMarker) -> Vec<Vec<Held>> {
    let Some(main) = NSApplication::sharedApplication(mtm).mainMenu() else {
        return Vec::new();
    };
    main.itemArray()
        .iter()
        .map(|top| top.submenu().map(|menu| items(&menu)).unwrap_or_default())
        .collect()
}

fn items(menu: &NSMenu) -> Vec<Held> {
    menu.itemArray()
        .iter()
        .map(|item| {
            let mask = item.keyEquivalentModifierMask();
            Held {
                title: item.title().to_string(),
                key: item.keyEquivalent().to_string(),
                modifiers: Modifiers {
                    control: mask.contains(NSEventModifierFlags::Control),
                    option: mask.contains(NSEventModifierFlags::Option),
                    shift: mask.contains(NSEventModifierFlags::Shift),
                    command: mask.contains(NSEventModifierFlags::Command),
                },
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const CMD: Modifiers = Modifiers {
        control: false,
        option: false,
        shift: false,
        command: true,
    };

    fn held(title: &str, key: &str) -> Held {
        Held {
            title: title.into(),
            key: key.into(),
            modifiers: CMD,
        }
    }

    fn item(id: &str, title: &str) -> Registered {
        Some((id.into(), title.into()))
    }

    #[test]
    fn a_chord_is_written_as_the_menu_bar_draws_it() {
        let shift_cmd = Modifiers { shift: true, ..CMD };
        let option = Modifiers {
            option: true,
            ..Modifiers::default()
        };
        let all = Modifiers {
            control: true,
            option: true,
            shift: true,
            command: true,
        };
        assert_eq!(label("ö", CMD).as_deref(), Some("⌘Ö"));
        assert_eq!(label(",", CMD).as_deref(), Some("⌘,"));
        assert_eq!(label("f", shift_cmd).as_deref(), Some("⇧⌘F"));
        assert_eq!(label("p", option).as_deref(), Some("⌥P"));
        assert_eq!(label("k", all).as_deref(), Some("⌃⌥⇧⌘K"));
        assert_eq!(label("x", Modifiers::default()).as_deref(), Some("X"));
    }

    #[test]
    fn a_capital_knows_no_locale_and_a_letter_without_one_stays() {
        assert_eq!(label("i", CMD).as_deref(), Some("⌘I"));
        assert_eq!(label("ß", CMD).as_deref(), Some("⌘ß"));
    }

    #[test]
    fn an_upper_case_key_asks_for_shift() {
        assert_eq!(label("F", CMD).as_deref(), Some("⇧⌘F"));
    }

    #[test]
    fn a_key_that_is_not_one_printable_character_has_no_label() {
        assert_eq!(label("", CMD), None);
        assert_eq!(label("\u{F700}", CMD), None);
        assert_eq!(label("ab", CMD), None);
        assert_eq!(label("\r", CMD), None);
    }

    #[test]
    fn items_pair_by_position_and_a_separator_keeps_the_positions() {
        let registered = vec![
            vec![item("settings", "Settings…")],
            vec![
                item("new-document", "New Document"),
                None,
                item("save", "Save"),
            ],
        ];
        let native = vec![
            vec![held("Settings…", "ö")],
            vec![held("New Document", "n"), held("", ""), held("Save", "s")],
        ];
        let got = chords(&registered, &native);
        assert_eq!(got.get("settings").map(String::as_str), Some("⌘Ö"));
        assert_eq!(got.get("new-document").map(String::as_str), Some("⌘N"));
        assert_eq!(got.get("save").map(String::as_str), Some("⌘S"));
        assert_eq!(got.len(), 3);
    }

    #[test]
    fn a_pair_whose_titles_differ_has_no_chord() {
        let registered = vec![vec![item("save", "Save")]];
        let native = vec![vec![held("Start Dictation…", "d")]];
        assert!(chords(&registered, &native).is_empty());
    }

    #[test]
    fn an_item_with_no_key_is_absent() {
        let registered = vec![vec![item("send", "Send")]];
        let native = vec![vec![held("Send", "")]];
        assert!(chords(&registered, &native).is_empty());
    }

    #[test]
    fn menus_of_different_lengths_do_no_harm() {
        let registered = vec![vec![item("a", "A"), item("b", "B")], vec![item("c", "C")]];
        // The system appended an item of its own, and one whole menu is gone.
        let longer = vec![vec![
            held("A", "a"),
            held("B", "b"),
            held("Emoji & Symbols", "e"),
        ]];
        assert_eq!(chords(&registered, &longer).len(), 2);
        let shorter = vec![vec![held("A", "a")]];
        assert_eq!(chords(&registered, &shorter).len(), 1);
        assert!(chords(&registered, &[]).is_empty());
    }
}
