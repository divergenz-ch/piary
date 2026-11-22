# ADR 0051 — A row's chord is read from the system's menu

**Status:** accepted (2026-11-16). Supersedes the chord rule of
[ADR 0050](0050-commands-come-from-one-catalog-and-have-two-ways-in.md) ("when the chord is on a
letter"); the rest of ADR 0050 stands.

## Context

A row of the `/` menu and of the palette names the chord of the menu item it runs. Since macOS 12
the system moves a menu shortcut to another key when the keyboard layout calls for it, draws the
moved key in the menu bar, and tells the app nothing: on a Turkish-QWERTY-PC layout the registered
`⌘,` is `⌘Ö`, and `⌘,` does nothing. A row that repeated what was registered named a key that did
not work. ADR 0050 answered by showing a chord only when it was on a letter, which left
`/settings` with none and the letters unchecked.

What the system does was measured, with a standalone AppKit probe on macOS 26.5.1 that built the
menu as muda builds it and sent key events to see what fires:

| Layout | Registered `⌘,` | Registered `⌘.` |
|---|---|---|
| U.S., German, Spanish ISO, Swedish Pro, Dvorak | `⌘,` | `⌘.` |
| French | `⌘,` | `⌘;` |
| Turkish-QWERTY-PC | `⌘Ö` | `⌘Ç` |

`NSMenuItem.keyEquivalent`, a public property, returned the moved key in every case, and the key
it named was the key that fired. The chords on letters read as registered. Three details shape
the code:

- Read in the call that installs the menu, the property still holds the registered key. One turn
  of the run loop later (21 ms) it holds the moved one.
- The value is lower case (`ö`). The menu bar draws it in capitals, with no locale: `i` is `⌘I`
  on a Turkish layout, never `⌘İ`.
- The items follow a layout switched while the app runs, with no call from the app.

An Apple engineer names the same read as the way to learn the key, and says there is no other API
for it: the property "automatically updates from your QWERTY specification to the localized
version … shortly after `NSMenuItem` has been added to an `NSMenu`"
([Apple Developer Forums, thread 810390](https://developer.apple.com/forums/thread/810390)).

## Decision

- **The chord is read from the menu item, never written in the page.** Rust reads the main menu
  back from AppKit (`src-tauri/src/menu_keys.rs`) and answers a chord per menu id
  (`menu_chords`). The catalog holds no chord: a command that runs a menu item shows that item's
  (`listCommands(pi, chords)`), so a punctuation chord is shown again and is the key that works.
- **The two menus are paired by position, and a pair is trusted only when its titles are equal.**
  Tauri gives no handle to a native item and muda puts no id on one, but it adds items in the
  order the app's menu lists them. AppKit appends rows of its own to some menus, after the app's.
- **No chord rather than a wrong one.** An item whose pair cannot be trusted, or whose key is not
  one printable character, has none. A wrong label was the fault this answers.
- **A layout switched while the app runs is followed late.** Rust emits nothing on a switch. The
  page asks at startup, each time its window is focused and each time the palette opens; until
  then a row may name the key of the layout before. The user accepted this: whoever switches a
  layout expects shortcuts to move.
- **`objc2`, `objc2-app-kit` and `objc2-foundation` are direct dependencies**, because the code
  names them. They are given as ranges, not pins: they must stay the versions Tauri resolves, or
  the binary carries two copies of each. `Cargo.lock` gained no package.

## What was considered and not chosen

- **Working the chord out from the keyboard layout** (`UCKeyTranslate` over the layout's data).
  The system's rule is not "the same physical key": on Turkish `⌘/` moves to `*`, a different key
  from the one `/` is on in the U.S. layout. It is not "only a character that is hard to type"
  either: `,` is a plain key on Turkish and is moved all the same. Apple publishes no table. Zed
  keeps tables of its own for each layout, made by drawing a menu under every layout and reading
  it, and calls the result a compromise
  ([Zed, keyboard localization](https://zed.dev/blog/keyboard-localization)). A copy of the rule
  is wrong on some layout; the item cannot be.
- **Turning the system's move off** (`allowsAutomaticKeyEquivalentLocalization = false`). The
  label and the key would agree by construction, and `⌘,` would be the comma key everywhere. But
  Piary would then differ from every other Mac app on the same layout, where Settings is `⌘Ö`,
  and it needs the same native access the read does.
- **An observer for the layout change**, so a row follows a switch at once. It needs a block
  passed to AppKit, so another crate, for a case the user waived.

## Consequences

- The chord a row shows is checked in the real app (`e2e-app/shell.spec.ts`), where the answer
  depends on the keyboard layout of the Mac that runs it: the test holds the letters exactly and
  a punctuation chord only to its shape.
- A menu item given an accelerator shows it on its command's row with no other change.
- Not verified: a right-to-left layout, a layout with no Latin letters (Russian read `⌘,` and
  `⌘.`, and what fires there was not established), macOS older than 26, and a shortcut the user
  reassigned in System Settings.
