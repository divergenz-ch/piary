# ADR 0049 — A conversation leaves and enters as a bundle, and the page never names a path

**Status:** accepted (2026-11-16). Builds on ADR 0001 (the file is the truth), ADR 0018 (the write
path and its backups) and ADR 0026 (attachments beside the conversation).

## Context

The app had no way to bring a conversation in or take one out. Open… lists what already sits in
the workspace's document directory, so importing meant finding that directory and copying a file
in by hand, and exporting meant finding the file on disk. A `.md` dropped on the canvas becomes an
attachment, not a conversation.

Three facts shape the answer. A conversation is one markdown file, but the files it shows live in
one `attachments/` shared by the whole workspace, so the file alone is not the conversation. The
filename is the conversation's id, and the id is its pi session. And the page draws what an agent
wrote and runs cell code, so whatever the page may ask Rust for, that content may ask for too.

## Decision

- **A bundle is the document and the files it references:**

  ```
  <name>/
    <name>.md
    attachments/      only when the document references any
  ```

  A zip bundle is that folder zipped, the folder its single top-level entry. The document's links
  are the record of which attachments are its (`src/document/bundle.ts`, pure), so only those
  leave with it.
- **Import and export act on conversations, and each has a window of its own**, one for the app,
  built as the Preferences window is (ADR 0048): File → Import… and File → Export… open it, or
  focus the one there is. Neither acts on the document in front: an import has no conversation
  yet, and an export asks which.
- **The Export window asks which conversations, then as what.** It lists the workspace's
  conversations, the one that was in front chosen, and below them the form: the markdown file
  alone, a folder bundle or a zip bundle, the markdown file first. The links stay as written
  (`/attachments/<name>`, `document-format.md` §Attachments), so a bundle imports back byte for
  byte.
- **One conversation is exported from its row.** The `⋯` of a row in the conversation list has
  `export…`, which opens the Export window on that conversation alone. An Export window already
  open is not opened twice: it is told which conversation is meant, and draws itself again on it,
  so it also lists what the workspace gained since it opened.
- **An export goes into a folder the user chooses**, each conversation under its own name
  (`notes.md`, `notes/`, `notes.zip`), because several leave at once. A name the folder already
  has is never written over: that conversation is not exported, the window says so, and the
  others go ahead.
- **Import takes a markdown file, a folder bundle or a zip bundle.** A folder or a zip holds
  exactly one `.md` at its top; anything else is refused with the layout expected.
- **The page never names a filesystem path.** A command that needs one shows the system's panel
  itself (`tauri-plugin-dialog`, called from Rust only), and an import that has been read but not
  yet placed is held by Rust and named to the page by a token. Rust does the file work; the page
  does what needs the format: the references, the version, the binding.
- **An imported conversation is bound to its new id**, so it never shares a pi session with the
  one it was exported from.
- **A name the store refuses is refused**, with the store's own message.
- **A name already taken is asked about, in the Import window:** Keep both, Replace, or Cancel.
  Keep both takes the first free `name-2`, `name-3`, …. Replace first keeps the document it
  overwrites as a backup, whatever the backups' usual spacing (ADR 0018 §3), so the answer can be
  taken back. A free name is imported with no question.
- **Each window says what it did**, a line per conversation, and stays open for another. The
  imported conversation opens in a window of its own.
- **An attachment the import carries** goes into the workspace's `attachments/` under its own
  name. The same name with the same bytes is already there and nothing is written. The same name
  with other bytes is stored under a fresh name and the document's links follow it.
- **A link whose file is nowhere is a broken link, not a refusal.** The import goes ahead and says
  how many links are broken and which. A markdown file imported alone is the usual case.
- **The format version is checked.** A document of a version this build does not know is imported
  byte for byte, unbound, and opens read-only as such a file always has (§Frontmatter), and the
  import says so.
- **Zip is read and written in the process, with the `zip` crate** (deflate only), so a bundle is
  made the same way on any platform the app comes to run on. An archive is untrusted and is never
  extracted as it says. Every entry is looked at first, and the whole archive refused if one is
  absolute, climbs with `..`, sits outside one top-level folder, or is a symbolic link. Then only
  the document and the regular files directly under `attachments/` are written out, each to a
  path the app made.

## Declined

- **Cleaning a refused name into an acceptable one.** The user would find a conversation under a
  name they did not give it.
- **Asking in the document's own window**, in the popover Open… lists documents in. The first
  version did. It read as something done to the document in front, which an import never is, and
  it left an export no room to ask which conversations.
- **A native message box for the clash question.** The Import window asks, so the whole flow is
  drivable in a page spec; a system panel is not.
- **A save panel per conversation.** It asks the user for one name at a time, and an export of
  ten would ask ten times.
- **Writing over a name the export folder already has.** No panel asked about that name.
- **macOS's own `ditto` for the archive.** It adds no crate, but it is a binary only one platform
  ships, and import and export are not a place to tie the app to one.
- **Rewriting links on export** so another markdown renderer resolves them. The bundle would no
  longer import back as the document it was.
- **Carrying every file in `attachments/`.** It holds every conversation's files.
- **For now: a rendered export (HTML, PDF)**, which first has to say what a cell, a drawn answer
  and a terminal become in a static file
  ([ADR 0066](0066-a-conversation-is-exported-drawn-as-a-page-or-a-pdf.md) says it, and adds
  the two); and **converting a document of another version**, which
  has nothing to convert from while only `v1` exists.

## Consequences

- Another markdown renderer shows an exported bundle's images as broken: the links are
  site-relative. The bundle is for Piary to read back.
- A document replaced while a window shows it reaches that window as an edit made outside it
  (ADR 0018): the window takes it in, unless it holds text no save has taken yet, in which case
  the window's copy wins and says so.
- An archive holding a symbolic link is refused whole, even one a person made by zipping a folder
  with a link in it. An export never makes one, and an entry placed under a link is how an archive
  writes outside the directory it is unpacked into.
- The dialog plugin replaces the page's `alert` and `confirm` with calls to its own commands, which
  the page is not granted: `confirm` would return a rejected promise, which is truthy. The page
  puts both back to what this webview has always answered, nothing shown and `confirm` false
  (`app/boot.ts`), and the real-app spec holds that.
- A system panel cannot be driven by a test. A debug build with the `e2e` feature takes the file
  an import opens from `PIARY_E2E_PICK` and the folder an export goes into from
  `PIARY_E2E_EXPORT_DIR`, instead of showing one (`docs/TEST_ARCHITECTURE.md` §6); no other build
  has that branch.
- With no window in front, the menu opens either window itself, as it does Settings…. An Export
  window opened that way has no conversation chosen.
