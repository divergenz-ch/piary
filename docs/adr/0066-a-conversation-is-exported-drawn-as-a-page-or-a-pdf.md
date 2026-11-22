# ADR 0066 — A conversation is exported drawn, as one web page or a PDF

**Status:** accepted (2026-11-23). Takes up what
[ADR 0049](0049-a-conversation-leaves-and-enters-as-a-bundle.md) declined "for now", and builds
on its window, its panel and its rule that the page names no path.

## Context

An export wrote a conversation as its markdown file, alone or in a bundle. That is the document,
and it is for Piary to read back: someone without Piary sees markers and fenced blocks where the
user sees a chart, a drawn answer and a terminal.

ADR 0049 left a rendered export out until three things were said: what a cell, a drawn answer and
a terminal become in a file nothing runs in. Two facts make them questions. The document holds a
cell's source and never its output (`notebook-cells.md`), so an output exists only where the cell
has run. And the canvas is a CodeMirror editor that draws only the lines in view, so no window
ever holds a whole conversation drawn.

## Decision

- **Two more rows in the Export window, after the three there were:** `Web page (.html)` and
  `PDF`. Markdown stays first and chosen. Like the others they act on the conversations chosen
  and go into the folder the panel gives, each under its own name (`notes.html`, `notes.pdf`),
  and a name already there is never written over.
- **The page is written from the document, not copied from the screen.** A pure function
  (`src/document/export-html.ts`) walks the document's segments by the rules the canvas draws
  them with, and writes HTML. What only a page can make is handed to it: what the cells drew,
  the views as drawn, the pictures' bytes.
- **What each kind of block becomes:**

  | In the document | In the export |
  |---|---|
  | The frontmatter | Nothing. The conversation's name is the page's title. |
  | A prompt, an answer, an unasked reply, a note | Its prose, under the label the canvas gives it (`you`, `agent`, `agent · unasked`, none for a note). The empty prompt a conversation ends on is not drawn. |
  | Thinking, a tool call, its result | A step folded under its label, which the reader opens; an error is open. In a PDF it stays folded. |
  | A `budget` call, a `cell` or `view` acknowledgement | Nothing, as on the canvas. |
  | A cell, an artifact | What its cells drew, as it stood when the export was made, over the source of each member, folded. An artifact stands where it was first written; an earlier definition of a cell is not shown. |
  | A view with a template (`a2ui`, a table, a diff, …) | What the template drew. |
  | A view nothing draws | Its payload, as text. |
  | A terminal | One line: a terminal ran here, and what it showed is not kept. The document never held it (ADR 0013). |
  | A stored picture | The picture, its bytes in the file. |
  | Any other attachment | Its name, and that it is not in this file. |
  | A picture on the web | A link to it. |

- **A cell's output is drawn by running the cell, in the Export window.** The window mounts the
  real canvas where nobody sees it, off screen and inert, at a column's width; the cells run as
  they do when the conversation is opened, from the widget state the conversation kept; and
  what each drew is copied out. Cells get twenty seconds. One still running then is exported as
  its source under a line saying it was not drawn, and the window's outcome line names it.
- **What is copied out is made still.** A form control keeps the value it showed and is
  disabled; a `<canvas>` becomes the picture it showed; every picture becomes its bytes;
  scripts, frames, handlers and any address that is not `http(s):`, `mailto:` or inside the
  page are removed; a custom element is written as a plain one. Prose is rendered with raw HTML
  as text, as the canvas shows it.
- **The web page is one file that asks for nothing.** Styles and pictures are inside it, and
  it carries a content security policy that allows no script and no request
  (`default-src 'none'; img-src data:; style-src 'unsafe-inline'`). Its styles are the ones the
  window draws with, read from the page's own style sheets when the export is made, so a view
  looks as it does on the canvas with no second copy to keep in step; the editor's, the
  terminal's and the form's rules are left out, and no font is carried: the page names the
  canvas's faces and falls back to the reader's own serif.
- **A PDF is the Export window printed.** The window puts the conversation in an element only
  paper shows (`#print-root`, `@media print`) and asks Rust for that one conversation; Rust runs
  the webview's own print operation with a file as its destination and no panel
  (`src-tauri/src/print.rs`). WebKit paginates, the text stays text, and no crate is added: the
  call goes through `objc2`, with two more features of crates the app already has.
- **The page still names no path.** A PDF export of several conversations is several commands,
  one conversation each, and the panel is shown once: every answer carries a token for the
  folder, the next command hands it back, and Rust holds only the last one.
- **One conversation that cannot be drawn or written is said, and the others go ahead**, as in
  every export.

## Declined

- **Copying the canvas's own DOM.** It holds only the lines in view, and it is an editor: the
  copy would carry carets, handles and menus, and would have to be scrolled through to be whole.
- **A second renderer for cells and views**, so nothing has to run. Their look is the catalog's
  and the notebook runtime's; a copy of either would drift from what the user saw.
- **Showing the cell's source only.** The chart is why the conversation is being handed over.
- **A page that stays live**, shipping the runtime so a slider still moves. It would run the
  conversation's code on the reader's machine, need the network for a cell's imports, and be
  megabytes. The export is a record of what was shown.
- **Pictures beside the page, in a folder.** Two things to hand over where one will do; a
  bundle already exists for carrying files.
- **Carrying the fonts.** Four faces would be most of the file's size.
- **The print panel**, where the user picks "Save as PDF". It asks where once per conversation,
  under a name the app did not give, and no test can drive it.
- **`WKWebView.createPDF`.** One page as tall as the conversation, which no one can print, and
  two crates named in `Cargo.toml` to call it.
- **Opening every step in a PDF.** A tool's output can be thousands of lines; the canvas folds
  it for the same reason. The web page holds it for whoever wants it.

## Consequences

- The Export window now runs the code of the conversations it exports as a page or a PDF,
  including ones no window has open. That is the code a window runs when the conversation is
  opened, with the same reach; the markdown and bundle rows run nothing.
- A drawn export is not read back. Import takes the document; a page or a PDF is for people.
- A cell that reads the network when it runs reads it again at export, and one that draws
  differently each run is exported as that run drew it.
- Dark colours are not exported: the page is drawn in the tokens the app draws with, which are
  the light ones.
- A page or a PDF of a conversation with a terminal says less than the window did while the
  terminal ran. That is the document's own limit, not the export's.
- The print operation is AppKit's and macOS only, like the app (ADR 0014).
