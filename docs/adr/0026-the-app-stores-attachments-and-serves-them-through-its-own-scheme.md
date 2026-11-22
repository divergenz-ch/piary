# ADR 0026 — The app stores attachments in Rust and the webview reads them through its own scheme

**Status:** accepted (2026-10-29; amended the same day: the compare reads bytes, and an image sent
to a model with no vision is said). Applies ADR 0002 and ADR 0021 to attachments, and closes ADR
0021's **Attachments** limit.

## Context

A file dropped on the document or pasted into it is a `pi:file` segment referencing
`/attachments/<name>` beside the conversation (`document-format.md` §Attachments). Something has to
store the upload, serve it back to the page, and turn image references into pi's `images` on a send
and into image parts on a rebuild. The app's store is Rust, its page is a WKWebView whose origin (`http://localhost:5190` in
development, `tauri://localhost` bundled) serves no `/attachments/` path, and its rebuild is written
by the page (ADR 0021). Three questions follow: who names and keeps the bytes, how they reach the
page and Rust without passing through JSON, and what bytes pi ends up with.

## Decision

- **Rust owns the store** (`src-tauri/src/attachments.rs`, no `tauri::` types), at
  `<doc dir>/attachments/`, beside the conversation. A stored file is named
  `<stem>-<id><ext>`, the stem cleaned of directories and unsafe characters. The mime
  is sniffed from the bytes with pi's own image rules (an animated PNG and a `ff d8 ff f7` JPEG are
  not images), plus `%PDF-`, and is never the page's claim, because it decides what becomes vision
  content. Over 10 MiB is refused. The write is the documents' atomic one, and every read goes
  through a name guard that pairs each refusal with the case that must still work, as the id guard
  does in `docs.rs`.
- **Bytes cross IPC raw.** The page sends a file as an `invoke` raw body, with its name in a
  percent-encoded `x-filename` header. Rust answers a read with `tauri::ipc::Response`, which the
  page receives as an `ArrayBuffer`. A JSON `number[]` would multiply a 10 MiB file several times
  over.
- **The webview loads attachments through `piary-file://localhost/<name>`,** a URI scheme registered
  with `register_uri_scheme_protocol`, which is core Tauri. Rust serves only images and PDFs inline,
  everything else as a download with `nosniff`, and a 404 for anything the guard refuses. The canvas
  gains one property, `resolveAsset`, applied after `safeUrl`. The app maps `/attachments/x` to the
  scheme, and the document keeps its site-relative url. **Not chosen:** Tauri's `asset` protocol with `convertFileSrc`. It needs the `tauri`
  crate's `protocol-asset` feature (a dependency change under the policy) and an `assetProtocol`
  file-system scope wider than one directory. `"csp": null` already allows the image source, so no
  CSP changes.
- **The window sets `"dragDropEnabled": false`.** Tauri's default intercepts an OS file drop as its
  own `tauri://drag-drop` event, so the DOM `drop` the canvas listens for never fires. Every
  page-layer test would stay green, because they dispatch synthetic DOM events. A cell's grip drag
  uses pointer events and is unaffected.
- **One path decides what pi hears of an attachment: `carrying` in `app/attachments.ts`.**
  - A send takes the `pi:file` segments directly above its prompt (`attachmentsAbove`).
  - An image becomes pi's `images`.
  - Any other file becomes one `[attached: NAME (MIME) at ABSOLUTE_PATH]` line after the prompt's
    text, the path supplied by Rust: the format's own words are "a path the agent can `read`".
  - Steering and follow-up take the same function when they arrive.
- **The page normalizes images to pi's limits** (`normalizeImage`): 2000×2000, under 4.5 MB of
  base64, PNG then JPEG at falling quality then smaller dimensions, and a type pi does not inline
  converted to PNG first. A model that declares its own resize limits (`inputLimits.images.resize`,
  read from `get_state`) gets those instead, as pi applies them. pi normalizes a *prompt's* images itself, but a rebuilt transcript is loaded
  as written, and pi's `processImage` is Node-only. Rust has no image crate, and adding one needs
  approval. The page has `createImageBitmap` and `OffscreenCanvas`. The send uses the same function,
  so one rule decides what pi sees on both paths. **The bytes differ from pi's photon; the limits are
  the same.**
- **A rebuild reads each user message's images back into its content,** so an image survives an edit above it. Its non-image lines are written into the message text.
- **The history compare reads image bytes.** An image already within the model's limits is one pi
  passes through unchanged, so the transcript holds exactly what the page sent, and the document's
  images, normalized the same way, are the transcript's byte for byte. ADR 0021's compare of what
  each side tells pi gains each user message's images, compared by data. Normalized images are kept
  in the page by stored name (a stored name always names the same bytes), up to 64 MB of base64, so
  each send does not redraw them. The attachment lines are written on both sides through the same
  function, so an unedited document under a PDF does not rebuild.
- **An image going to a model with no vision is said when it is dropped:** `get_state`'s model names
  its `input` types.

## Consequences

- **A swapped, added or removed image is an edit,** and rebuilds.
- **An image the store can no longer read** is skipped on a send, a rebuild and the compare alike, so
  it neither fails a send nor rebuilds every one.
- **The compare depends on pi passing a within-limits image through unchanged** (pi 1.0.4's
  `processImage`). A pi that re-encodes every image would make each send under an image rebuild;
  the probe's second sync is what would show it.
- **The warning starts pi** when an image is dropped, if it is not running: the model is pi's to know.
- **Attachments are never deleted** by the app: a file stays until the user
  removes it from `attachments/`.
