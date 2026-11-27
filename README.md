# Piary

One canvas, not a chat: a markdown document that you and the
[pi](https://github.com/earendil-works/pi) agent both write into, in place.

Piary is a macOS desktop app (Tauri 2: a Rust main process and the system WebKit view). A
conversation is one markdown file; pi answers into it at your caret, and you can edit anything in
it, history included.

## Run it

You need **Rust** (`cargo` on your PATH), **Node 22.18 or newer**, **pnpm**, and **your own `pi`**
on your PATH. The app runs your pi, the one your `~/.pi/agent/settings.json` packages were installed
against. A build from this checkout bundles none of its own; a released `Piary.app` ships one, which
it runs only on a Mac with no pi.

```sh
pnpm install
pnpm sidecar:build   # the screen-capture helper, once (needs swiftc)
pnpm app             # tauri dev: builds the Rust side and opens the window
```

`docs/running-the-app.md` has the one-time setup, the self-test, and the manual walk-through;
`docs/packaging.md` builds a distributable `Piary.app`.

**Where conversations live:** `~/.pi/agent/docs/<workspace>/` beside pi's transcripts, where the
workspace is the directory the app was launched from (or `PI_CWD`). A workspace with a `pi-docs/`
directory in its root keeps them there instead, so they can be committed. `PI_DOC_DIR` overrides
both.

**Signing in:** the first prompt with no provider says so and offers **Sign in**, a panel in the
document over pi's own login: an API key, or an account. pi keeps the credential.

**Attachments:** drop a file, paste an image, or use the paperclip. Pictures ride along with the
next prompt as real vision content; anything else is stored beside the conversation and named to
the agent by path.

**Links:** Cmd-click opens a link. An ordinary click places the caret, so you can edit the
markdown.

## The camera

Piary can read how your face moves while you type and while you read an answer, and tell the agent
in a few plain words at the end of your message. It is **off until you turn it on**, and asks
first, on a sheet that says what is read and what is sent.

- The picture never leaves the window and is never stored. A model in the page turns it into
  numbers, and the app turns those into words such as `typing "like you said": brows lowered
  marked 2.6s`.
- Those words go where your message goes: to the provider of the model that answers. They are
  never written into the document.
- The camera is on only while you type, for 20 seconds after your last key, and for a few
  seconds after an answer appears. ⌥⌘F turns the reading off and on.
- It reports movements, never feelings, and it was tuned on one face: expect it to be wrong.

`docs/face-format.md` is the format, and ADR 0055 to 0061 in `docs/adr/` are the decisions.

## State of the project

Piary is an early release from a small studio: macOS only, built from source, not signed or
notarized, and changing quickly. The document format (`docs/document-format.md`,
`docs/notebook-cells.md`) is the part meant to last.

Bugs and questions go in the repository's issues. `CONTRIBUTING.md` says how a change is
checked, and `SECURITY.md` how to report a vulnerability.

## Build

```sh
pnpm install
pnpm build      # tsc → dist/ + esbuild → dist/styles.css
pnpm typecheck
```

## Checking a change

There is no hosted CI. Before a pull request is merged, run the gate it is held to on your own
machine:

```sh
make ci         # all of the below
make lint       # the hard rules a script can check
make typecheck  # every tsconfig, against a fresh build
make test       # the unit, contract and jsdom suites, against a fresh build
make e2e        # the browser layer, WebKit and Chromium
make rust       # the app's Rust half (macOS, Xcode command line tools)
```

Each starts from a frozen-lockfile install and an emptied `dist/`, so a pass on your machine means
what it would on a clean checkout. Nothing runs these for you; `make help` lists them. The real app
under WebDriver is `pnpm app:e2e:build && pnpm test:app`.

## License

Piary is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE): you may use,
change and share it for any noncommercial purpose. Commercial use needs a separate licence from
Divergenz, who hold the copyright.

What Piary ships that others wrote, and under which licences, is in [NOTICE.md](NOTICE.md).
