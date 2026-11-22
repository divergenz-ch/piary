# Running the app, and smoke-testing it by hand

For building a distributable bundle see `packaging.md`. The automated layers and what they cannot see are
`TEST_ARCHITECTURE.md` §6–7 — this page is the walk-through for the things no
layer covers.

## 0. One-time setup

**Rust must be on your PATH.** It is installed at `~/.cargo` but nothing in the
shell profile points at it, so `pnpm app` fails with `cargo: not found`:

```sh
echo '. "$HOME/.cargo/env"' >> ~/.zshrc && exec zsh
```

Check: `cargo --version` prints `1.99.0` or later.

**The capture helper is built separately**, because `swiftc` is its own
toolchain and a Rust-only machine should still build everything else:

```sh
pnpm sidecar:build
```

It writes two names into `sidecar/bin/` — one with the target triple, which is
what `externalBin` looks for, and one without, which is what a dev build finds.
Rerun it after editing `sidecar/capture.swift`; nothing else triggers it.

**`pi` must be on your PATH.** The app runs *your* pi, not a bundled one
(ADR 0004), and there is no fallback — an absent one is reported as a notice
naming the fix. Check with `pi --version`.

## 1. Run it

```sh
pnpm app
```

That is `tauri dev`: it starts Vite on :5190, builds the Rust side, and opens
the window. First run compiles ~230 crates and takes a few minutes; later runs
are seconds. Edits to `app/` or `src/` hot-reload; edits to `src-tauri/` rebuild
and relaunch.

**Point it at scratch documents** so a smoke test never touches real
conversations:

```sh
PI_DOC_DIR=/tmp/piary-scratch pnpm app
```

**Free drawing.** How the agent draws an answer to look at is a mode (ADR 0044). By
default it is `a2ui`: a `view` drawn through Piary's catalog. To have it draw with
cells instead, start the app with `PIARY_DRAW=free`:

```sh
PIARY_DRAW=free pnpm app
```

The mode is read when a pi starts, so it holds for every conversation and subsession of
that run, and going back is quitting and starting without the variable. It changes what
the agent is told and nothing about what the page draws: a conversation answered in one
mode opens and draws in the other. There is no control for it in the window. A
`Piary.app` opened from Finder has no such variable, and is in `a2ui`.

**The self-test.** The page's `?probe=1` suite checks the window, the store,
the PTYs, capture and a real pi — no model call — and exits with its verdict,
one `PROBE PASS|FAIL` line per check:

```sh
npx tauri dev --no-watch -c '{"app":{"windows":[{"title":"Piary","width":1100,"height":760,"minWidth":480,"minHeight":360,"url":"index.html?probe=1"}]}}'
```

It opens the stored welcome document, so "the document round-trips" fails on a
machine whose welcome document has been edited; every other check stands on its
own. Its history checks leave small transcripts under `probe-history-` and
`probe-attachments-` ids in this workspace's pi sessions, and two `probe-` files
in its `attachments/`.

**Where the output goes.** The window's console is forwarded to the terminal
through Rust (`src/forward-console.ts`), so a page error appears as
`PAGE error …` where you started it. Without that it would reach nothing —
WKWebView forwards nothing on its own, and that is the one property that makes
this lane hard to debug. The same lines, and the relays' notes, also land in
the app's log file — the one place they reach when the app was launched from
Finder (`packaging.md` §5).

## 2. The smoke test

Ten minutes, in order. Each step says what to look for, because "it opened" is
not the same as "it works".

### The canvas

1. **It opens** on a splash, *Welcome to Piary*, when nothing is stored under
   `welcome` (`PI_DOC_DIR=$(mktemp -d) pnpm app` gives a first run on any
   machine). **Take the tour** walks the tour document a step at a time: drag
   the slider (the sentence changes, with no pi started), change *three* to
   *five* where the arrow points, ⌘⏎, then the answer's `⋯`, the list, the
   model chip and the empty prompt. Nothing else takes a click, a key or a menu
   item meanwhile. With no provider, the send forks to Sign in and comes back to
   the send once it takes; cancel it to see Try again and Sign in later, which
   writes a recorded answer. **Quit onboarding** ends it and the status line says the tour
   is under Help. On a machine with a stored `welcome` it opens on that instead,
   with no splash; **Help → Welcome to Piary** opens a fresh tour in a new
   window either way, and walks it.
2. **Click into a line and type.** The caret lands where you clicked and the
   text appears. This is the layer three Playwright specs already cover; you are
   checking the real WKWebView agrees.
3. **Type a line in the empty prompt at the end of the tour, and ⌘⏎.** The status line — a chip at the top of the
   window, with a dismiss button — should say something, and this is where you
   find out whether pi is authenticated.

### A prompt, end to end

4. **Type a question and press ⌘⏎.** Expect, in the document itself:

   ```
   What is 2+2?

   <!-- pi -->

   4

   <!-- you -->
   ```

   The answer arrives *in the document*, attributed with `<!-- pi -->`, with a
   fresh user block after it. If the answer appears but the markers do not, the
   turn wiring is wrong; if nothing appears, check the terminal for `PAGE`.

5. **Toggle to source** and confirm the markers are HTML comments. Any markdown
   renderer should show a clean document (ADR 0001) — open the file in iA Writer
   or TextEdit if you want to see it.

6. **Edit the answer, then send again.** The document is the history
   (ADR 0002), so your edit is what the next turn is rebuilt from, not what pi
   remembers. Change a word in pi's answer and ask "what exactly did you just
   say?": the reply quotes your edit. Then use "run again" from the cell menu on
   a prompt with later turns below it, and ask about one of those later turns:
   pi does not remember it, because the history above the re-run is all it
   was given.

### Cells

Lettered rather than numbered: the steps below are cited by number elsewhere.

6a. **Insert a cell.** Hover the gap between two cells and click its `+`. A menu
    offers Markdown, Prompt and JavaScript, the first one focused. Choose
    Markdown and type: the text lands in a new cell, in that gap. Escape, or a
    click outside the menu, closes it without inserting anything.

6b. **Move a cell.** Drag a cell by its grip (the handle left of its label)
    below another. The gap it will land in highlights, and on release the cell
    is there. ⌘Z puts it back. Quit and reopen: the order you left is the order
    you get.

6c. **The cell menu.** Click a cell's grip without dragging. The menu offers
    run (disabled on a markdown cell), the three modes with the current one
    marked, duplicate and delete. Change a markdown cell to a prompt; delete an
    answered prompt and see its answer go too; ⌘Z.

6d. **The step and quote menus.** On a reply, its `⋯` offers run again and
    delete; delete takes that reply alone. Select a sentence of an answer and
    right-click it: "quote for follow-up" puts it in a new prompt at the end of
    that block.

6e. **The block menu.** Click a block's head, or right-click the block. Answer
    this block, then rename it (the question appears in the document, under the
    block; Enter writes the `##` heading, Escape leaves it), collapse and
    expand it, and delete it; ⌘Z brings it back. Quit and reopen: the edits are
    kept.

6f. **Collapsed blocks are remembered.** Collapse a block, quit and reopen: it is
    still collapsed. Type a line into a block above it, quit and reopen: still
    collapsed, on the same block. Delete a collapsed block: the block that moves
    up into its place is not collapsed.

6g. **The block rail.** Down the right edge, one tick per block and smaller ones
    for its steps. Scroll: the dark tick follows what you are reading. Click
    into a block: its ticks glow. Click a tick, or drag along the rail: the
    document jumps there. Hold ⌥ and drag a block's tick below another: the
    block moves; ⌘Z puts it back. Collapse a block and ⌥-drag it: it stays
    collapsed where it lands. While an answer streams, its tick appears and
    grows with it.

6h. **Widget state is kept.** Run a cell with a slider or a `state()` value
    (`const n = view(state('n', 1))`), change it, quit with ⌘Q and relaunch:
    the value is still what you set. A document an earlier Piary saved widget state
    for shows that state the first time the app opens it.

6i. **Attachments reach pi.** Drag a PNG from Finder onto a prompt's block: it
    shows as a picture in that block, and a `pi:file` segment sits in front of
    the prompt. Ask "what is in this image?" — the answer describes it. Then
    edit a word in an answer above it and ask again: the rebuilt history still
    holds the image, so the answer still can. Paste a screenshot (⌘⇧⌃4, then
    ⌘V) and it lands at the caret's prompt the same way. Drop a PDF and ask
    about it: the agent is told its path and opens it (a PDF shows as a link,
    not a preview). Last, reorder two cells: hover a cell, take the grip that
    appears in its left gutter, and drag it into the gap above the other — it
    still moves, because the window hands file drops to the page
    (`dragDropEnabled: false`, ADR 0026) without taking anything else.

6j. **A failing cell is reported to the agent.** The `cell` tool comes from
    `pi-ui-views`, which the app hands every pi it starts. Ask for "a js cell that throws an error on purpose, then fix it". The cell
    turns red, a folded `[cell report] #… failed: …` prompt appears in the
    block, and the agent rewrites the cell in the same turn. Send again: the
    report stays where it is, because pi's history already holds it.

6k. **Subsessions.** Write `/subagent say hi` on the trailing prompt and ⌘⏎.
    A card takes its place, showing *running*, then *done*; what you wrote
    above the invocation stays as the prompt below it. Click **open**: the
    child's document opens in a window of its own, holding its prompt and its
    answer, and clicking **open** again focuses that window rather than opening
    another. Start a long one (`/subagent count slowly to 200`) and click
    **stop**: it aborts, and the card stops offering it. Quit, reopen: the
    card says *done*. Close the parent's window while a child runs: the child's
    pi stops with it (ADR 0027).

6l. **The conversation list.** A column down the left, with a line between it
    and the conversation; the button in the top-left corner hides and shows it,
    and the choice is kept. Make the window narrow: the list hides itself, and
    the button opens it over the text instead. In it: every conversation, newest first,
    named by its first heading or line, the one this window shows highlighted.
    Send a prompt and watch its row get a running dot until the answer ends.
    Click another row: the window switches to it (about a second). Click
    **+**: a new, empty conversation. Switch away from a running answer and
    back: it kept going while you were away. With the same conversation open in
    a second window (row's `⋯` → open in new window), clicking its row in the
    first window focuses the second instead. Each row's `⋯`:
    - **rename** writes the first heading;
    - **duplicate** copies the conversation and opens the copy here;
    - **delete…** asks again, then removes it, its history and any window
      showing it.

6m. **Pick a model and an effort.** The chip at the window's bottom-right names
    what pi runs, or `model` / `effort` until pi has started. Click the model
    pill: pi's models, under their providers, the running one marked. Choose
    another, send, and the answer comes from it. Choose one you hold no key for:
    the status line says why, and the pill keeps naming the model pi runs. Pick
    a reasoning model, then the effort pill lists only the levels it takes. Pick
    an effort, switch to a model that does not take it: the pill shows the next
    level up, and its tooltip your pick. Switch back: your pick again.
    Close the window and reopen the conversation: the pill names the same model
    once pi starts. ⌘N then starts a document on the same model and effort,
    and so does a `/subagent` child.

6n. **A tool's output.** Ask "list the files here with ls". While `ls` runs, a
    read-only terminal panel streams its output in the answer, under the call;
    it takes no keystroke. When the turn ends, the result sits under the call, in
    source a `<!-- pi:result #id -->` fence after the `<!-- pi:tool bash #id -->`
    one, with the panel's `<!-- pi:view terminal #id -->` between them. Then ask
    a second question: the app's log
    (`~/Library/Logs/ch.divergenz.piary/piary.log`) holds no
    `PI <sid> rebuild: … entries to …` line for that send. One would mean the
    document and pi's transcript disagree about the tool turn, and pi was
    handed a rewritten history.

6o. **Steer a running turn, and queue a follow-up.** Ask "count from 1 to 30,
    one bash call per number, each `sleep 2; echo N`". While it counts, type
    "stop at 4" in the prompt at the bottom and press ⌘⏎: it leaves the prompt
    and lands once, folded, in the answer where pi took it (after the bash call
    that was running), and the counting stops there. Then type "then say BANANA"
    and press ⇧⌘⏎: the badge at the top of the answer reads `… · 1 queued` until
    the answer is done, then the follow-up lands folded below it, is answered,
    and only then does the turn end. A steer is counted too, but only until the
    running tool call finishes, so the follow-up is the count to watch. In source
    neither message carries its `[now: …]` line.

6p. **The context a conversation uses, and its tokens and cost.** Send two
    prompts. Left of the model pill, the chip shows a slim bar with `<used> /
    <window>` beside it (its tooltip gives the percent), then the session's
    totals, `↑in ↓out` and a `$` cost when the model has one. Both grow with each
    answer, and match the footer `pi --session <file>` shows for the same
    session. Switch model: the window size follows the new model, and the totals
    stay. Start a `/subagent` child and let it answer: the parent's totals grow by
    the child's, the meter does not, and the totals' tooltip reads `session
    tokens, sub-agents included`.

6q. **Sign in, with pi holding no provider.** Launch the app with pi pointed at an
    empty agent dir and no provider variable set, so your real
    `~/.pi/agent/auth.json` is never read or written:

    ```sh
    env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY PI_CODING_AGENT_DIR="$(mktemp -d)" pnpm app
    ```

    (unset any other `*_API_KEY` you export, too). Open a `/terminal` and leave
    it. Send a prompt: pi's "No API key found" error lands under it, and below
    it an ask, *pi has no provider to answer with*, with **Sign in**; at the
    bottom right a red **Sign in** button appears beside the model chip, whose
    pills blink red with it (steady red with Reduce Motion on). Click either
    **Sign in**: a sign-in panel opens in the document, listing pi's providers
    with a search field; no terminal opens. Pick a provider's **API key**, paste
    a key into the masked field and press Enter: the panel closes, the status
    line says *Signed in to …*, your `/terminal` is still there and still
    answers, and no "pi stopped" notice appears; the red button is gone and the
    chip has stopped blinking. Send again: an answer arrives, and a hint points
    at the model chip.
    Then the account path: `/login` in the creation menu opens the same panel;
    pick an account sign-in (*Sign in with ChatGPT*, *Sign in with Claude*),
    click **Open sign-in page**, finish in the browser (or paste the code it
    gives you), and the panel closes the same way. Cancel at any step closes it
    and changes nothing. The model menu's **Sign out…** lists what pi stored;
    picking one signs out of it. With only an environment key, it says there is
    nothing pi can remove.

### What the app does not do yet

Every canvas gesture is answered: `OWED` in `app/canvas-events.ts` is empty.

One native feature has no way in from the page yet: **capture** runs in Rust
(`capture.rs`), and the page calls it only from its `?probe=1` self-test.
So steps 10–12 cannot be walked in the app today; the capture backend is held by
`pnpm test:app` (`e2e-app/quit.spec.ts` opens it) and the probe suite meanwhile.
The steps stay written for when each lands.

### Terminals

7. **Open a terminal** — type `/terminal` on the trailing prompt and choose the
    row, or Conversation → New Terminal. Run `pwd` (the workspace), `ls`, then
    `echo $TERM` — expect
    `xterm-256color`, which is what makes it a terminal rather than a pipe.
8. **Resize the window** mid-session and run `tput cols`: the number follows the
    grid. That is the ioctl reaching the shell, not a cosmetic reflow.
9. **Close the terminal's panel, then check the shell really died:**

    ```sh
    pgrep -fl -- "$SHELL -l"
    ```

    Empty. The app runs the login shell as `$SHELL -l`, so this finds it and not
    the shells of your own Terminal windows, which run as `-zsh`.

    A shell outliving its panel is the failure ADR 0013 names, and it is
    invisible from inside the app.

### Capture

*Not reachable in the app yet — see above.*

10. **Start a capture.** The first time, macOS asks for Screen Recording — and
     the prompt must name **Piary**, not `piary-capture`. That is the
     responsible-process inheritance in ADR 0015 working; a prompt naming the
     helper means the sidecar is in the wrong place.
11. **Grant it, relaunch, capture again.** An ad-hoc signed build keys its TCC
     grant to signature *and* path, so a rebuild loses it — expect to re-grant
     during development. `tccutil reset ScreenCapture ch.divergenz.piary` clears
     the slate when the state gets confusing.
12. **Then check nothing was left holding the grant:**

     ```sh
     pgrep -fl piary-capture
     ```

     Empty. A helper nobody is reading is the same shape of leak as step 9's
     shell.

### The window itself

13. **Quit and reopen.** The window returns to its size and position.

     What a quit ends and writes is checked by `pnpm test:app` (`e2e-app/quit.spec.ts`): with two pi
     sessions (one with a running tool's child, one that ignores its stdin), a terminal and the
     capture helper up, an edit made inside the save debounce, and a SIGTERM to the app, the edit is
     on disk, the app exits 143, and not one of those processes is left. A SIGTERM enters the same
     sequence ⌘Q does (ADR 0019 §2), so that is the sequence checked. **What stays here is ⌘Q
     itself** — that the menu's key equivalent reaches the sequence at all, which layer 4 must not
     assert (it would be a keystroke, ADR 0014). So, once: type a line and press ⌘Q at once; reopen,
     and the line is there; and with pi running (send a prompt first) when you quit,

     ```sh
     pgrep -fl 'pi --mode rpc'
     pgrep -fl piary-capture
     ```

     both empty. Open a terminal before quitting too, and `pgrep -fl -- "$SHELL -l"` is empty after
     as well (step 9). Then once mid-answer: the turn
     is aborted, and the answer as far as it got is in the reopened document. A second Ctrl-C in the
     `pnpm app` terminal stops waiting on the page: the children are still reaped, the buffer is not
     flushed. Two exits do not flush, and that is stated rather than a bug to find: the Dock's Quit
     and a logout reach only `RunEvent::Exit`, where no page can be asked anything — either may lose
     up to one save window of typing (ADR 0018 §1).
13a. **Focus mode.** Press ⇧⌘F (**View ▸ Focus Mode**). The conversation list
     and its button slide off to the left, the block rail to the right and the
     model chip to the bottom, each leaving a thin sliver; the text does not
     move, and the status line stays. Bring the pointer near an edge and that
     edge's control comes back; in a corner both edges' controls do, which is
     expected. With the list revealed, its button still hides and shows it.
     Click into text near the left margin: the sliver takes no click meant for
     the text. Quit and reopen, and focus mode is still on; ⇧⌘F again turns it
     off. The slide, the reveal and the reload are held by `e2e/app-page.spec.ts`
     through the menu's event; what stays here is the chord itself and a real
     pointer's reveal.
14. **Menus.** A page cannot click a native menu item, so no automated layer
     sees the click itself; the page layer delivers the event it emits. Walk:
     - **Conversation → Send** sends the caret's prompt, the same send as ⌘⏎.
       The item draws no shortcut, so the menu cannot take the key: ⌘⏎ in
       prose sends **once**, and ⌘⏎ in a cell runs the cell.
     - **Stop** (⌘.) stops a streaming answer and leaves what arrived. **Escape**
       still stops one too, and Escape closes an open popover (the block menu) —
       the menu must not take the key from the page.
     - **Show Source** with the caret in a view shows its JSON, and again hides
       it; with the caret in prose the status line says what it works on.
     - **File → Save** (⌘S) writes the document; the status line shows it saved.
     - **New Terminal** opens one terminal — with two windows open, in the
       focused one only.
     - **New Document** (⌘N) opens an empty document in a new window; a second
       ⌘N opens another.
     - **Commands…** (⌘K), with the caret anywhere, opens a palette of every
       command over the document, which does not move. Type `mod`, press Enter:
       the model list opens. ⌘K again, `sub`, Enter: `/subagent ` is on the
       trailing prompt with the caret after it. Escape closes the palette
       having done nothing.
     - **Model…** (⌥P) and **Effort…** (⌥T) open the chip's model and effort
       menus, the keyboard on the first choice; Escape closes them having
       chosen nothing.
     - **The caret keys** are the ones every Mac text field has: ⌘← and ⌘→ go
       to the line's start and end, ⌥← and ⌥→ by word, ⌘↑ and ⌘↓ to the
       document's start and end.
     - **Help → Check for Updates…** says on the status line what it found (step 20).
     - **Help → Welcome to Piary** opens a fresh tour in a new window, and
       leaves this window's document as it was.
     - **Open…** (⌘O) lists the workspace's documents by heading, this window's
       own marked; choosing one focuses its window, or opens one.
     - **File → Export…** opens the Export window; again, from any window,
       focuses that one. The conversation that was in front is ticked. Tick a
       second, choose **Zip, with attachments**, and **Export…**: the system
       panel asks for a folder, and each conversation is written into it
       under its own name. The window lists what was written. Export again
       into the same folder: nothing is overwritten, and the window says so.
     - **A row's ⋯ → export…** in the conversation list brings the Export
       window to the front with that conversation ticked alone.
     - **File → Import…** opens the Import window. Choose a zip just
       exported: the name is taken, so the window asks **Keep both** or
       **Replace**. Keep both opens the copy in a window of its own, and the
       Import window says what it was imported as. Replace keeps the replaced
       document under `.backups/`. With every window minimised, both items
       still open their window.
     - **Piary → Settings…** (⌘,) opens the Preferences window; again, from
       any window or from the Preferences window itself, focuses that one
       rather than opening a second. With every window minimised it still
       opens. With the Preferences window in front, ⌘N opens a new document
       and ⌘. does nothing. While a run works on a cell, turn **Pulse the cell a run is
       working on** off: the wash over the cell stops at once, in every open
       window, its chip stays, and the cell still takes no click until the
       run is done with it. Quit and reopen, and it is still off. What
       the window writes and what a page does with a change are held by
       `e2e/app-page.spec.ts`, `e2e/flows.spec.ts` and `e2e-app/shell.spec.ts`;
       the click, the chord and the no-window case stay here.
15. **An external edit, from a real editor.** The watcher and the page's reconcile (ADR 0018 §3) are
     checked by `pnpm test:app` (`e2e-app/outside-edit.spec.ts`): a write in place and a write by rename
     both appear in the open window with the caret where it was, and when the window holds text no
     save has taken, it keeps its copy, says so on the status line ("The file changed outside Piary
     while this window had unsaved text…"), and its next save replaces the edit on disk. What only
     you can do is be the editor and the hands: save the open conversation from iA Writer, or
     another editor with its own save strategy, and watch the text appear in place; then **type**,
     and the keystroke lands where the caret was rather than under the new text.

### The things most likely to be broken and least likely to be noticed

16. **IME.** Switch to a Japanese or Chinese input method and type into the
     canvas: candidates appear, committing inserts once, and backspace during
     composition does not eat the previous character. **No layer can drive
     this** — WebDriver cannot compose and jsdom has no IME — so if it is broken,
     this step is the only thing that will tell you.
17. **Display sleep.** Let the display sleep with the app open, then wake it.
     No frozen window, no orphaned helper.
18. **A second display**, if you have one: move a window to it, quit, unplug it,
     reopen. The window comes back somewhere reachable rather than off-screen.
19. **The face.** No automated layer opens the camera (`docs/TEST_ARCHITECTURE.md` §6), so this
     is the only check of the real one. In a built app opened from Finder (in a dev run the
     camera grant lands on the terminal):
     - Click the face at the right of the model chip, then *Turn on*. The first time, a sheet
       in the document says what is read and what is sent; nothing has asked for the camera
       yet. *Turn on* there: the pill is outlined. (Switched on in Settings… → Camera
       instead, the sheet shows by itself in the document window once it is in front.)
     - Type in the prompt: macOS asks for the camera the first time, the camera's light comes
       on, and the pill gets a green dot. Stop typing: within about 20 seconds the light and
       the dot go. Type again, then click another app's window: both go at once.
     - While it watches, cover the camera, then turn your head well away: the pill turns
       dashed, and its menu says no face is in view, then that your head is turned.
     - Type a few words with a relaxed face (the first two seconds of the first message are
       how the app learns your face at rest), then the rest of the sentence while pulling your
       brows down hard, send it, and read what pi was handed (pi's transcript, or ask it to
       quote the end of your message): a `[face]` block naming those words. The document shows
       none.
     - With a second camera (an external one, or an iPhone nearby as a Continuity Camera): the
       Mac's own camera is the one whose light comes on, and the phone does not wake, the
       first time after allowing the camera included (ADR 0057 says why that moment is the
       one to watch). The pill's menu
       lists the cameras once one has been read; choose the other, type, and that one's light
       comes on. Quit, reopen, type: the chosen one again. Unplug it while typing: the Mac's
       own takes over.
     - In System Settings → Privacy & Security → Camera turn Piary off (macOS may ask to quit
       and reopen it), then type: the pill turns amber, and its menu's *Open System Settings*
       opens that same list.
     - From the pill's menu open *What is read and sent…* and type: a bar per expression
       moves as you frown, raise your brows and smile; turn your head away and the bars say
       not read. What was found is listed, the weak and the short struck through, and the
       block the message would carry is shown and matches what pi is then handed. Set *at
       least* to slight: a slight movement now passes. *Show camera* shows your picture
       mirrored, with the reading going on; close the panel and it is gone. *Reset*.
     - On a sent message's block menu, *face: what was sent* shows that message's block.
     - Send a message and keep your hands off the keys while the answer appears: the
       camera's light comes on when the answer is done and goes off about six seconds
       later. Frown at the answer meanwhile, then send another message: its block begins
       with a `read` line. Note how long the light takes to come on: that is taken out of
       the four seconds read. Do the same with the answer scrolled out of sight: no light.
     - In the pill's menu turn on *Let the agent speak first* (use Sonnet or Opus). Ask
       something whose answer uses a term you would frown at, frown at it, and type nothing
       for six seconds: within a few more the agent adds a line under its answer, labelled
       unasked, or adds nothing. The caret stays where it was. *Not helpful* removes it. The
       panel counts how often it was asked. Then look away at something else and frown: note
       whether it speaks, since that is the misfire to watch for.
     - Press ⌥⌘F: the pill goes faint and the camera's light off, and a message typed now
       carries no block. Press it again: the pill is outlined, and the next key lights the
       camera.
     - Turn it off from the pill and type: the light stays off.
     - What can go wrong under a reading, each tried while the camera's light is on: unplug
       an external camera that is being read (the Mac's own takes over, or the pill says no
       camera); lock the screen, then unlock (light off, and on again at the next key); let
       the Mac sleep and wake it (the same); open a second document window and type there
       (only the window in front lights the camera); quit Piary mid-read (the light goes
       off: nothing outlives the app).
     - Watch Activity Monitor while typing for a minute: the reading costs about 30% of one
       core, in the web content process. Whether that is acceptable, or every third frame
       should be read instead of every second, is a decision that waits on this.
     - Over a week of your own use, open *face: what was sent* on messages now and then and
       say whether the block was right. The panel's count is the measure.

20. **A newer version.** No automated layer asks GitHub (`docs/TEST_ARCHITECTURE.md` §6), so
     this is the only check of the real request. It needs a published release that is not a
     pre-release, newer than the build: until there is one, expect a line
     `PAGE update no newer version was looked up: GitHub answered 404` in the log
     (`docs/packaging.md` §5) a moment after launch, and nothing on screen.
     - With such a release: a moment after launch a pill `Update X.Y.Z` is left of the model
       in its chip. Its menu names both versions; *Open the download page* opens that release's page
       in the browser.
     - Open a second document window: the pill is there at once, and the log shows no second
       request.
     - *Dismiss this version*: the pill goes in every window, and is not back after a
       relaunch.
     - Settings… → Updates, switch *Check for a newer version* off, relaunch with the
       network watched (Little Snitch, or `nettop -p $(pgrep -x piary)`): no connection to
       `api.github.com`.
     - With the network off, launch: nothing on screen, one `PAGE update` line in the log.
     - **Help → Check for Updates…**, with the switch off and the network on: the status line
       says the newer version, or that this build is the newest; with no such release yet it
       says `Could not check for a newer version: GitHub answered 404`. With the network off
       it says why. Chosen from the Preferences window it does nothing.

## Importing and exporting a conversation

Both act on conversations, not on the window in front, and each has a window
of its own.

**File → Export…** opens the Export window. It asks two things:

1. **Which conversations.** Every conversation of the workspace, with a tick
   box. The one that was in front is ticked.
2. **As what.** One of:
   - **Markdown (.md)** — the conversation's file, as it is stored.
   - **A folder** or **a zip** — a *bundle*: the file beside the attachments it
     references.

     ```
     notes/
       notes.md
       attachments/
         shot-a1b2c3d4.png
     ```

     A zip holds that folder as its one top-level entry.

A row's **⋯** in the conversation list has **export…** too: it opens the same
window with that conversation ticked, and no other. If the window is already
open it comes to the front on that conversation.

**Export…** then asks for a folder, in the system's panel, and writes each
conversation into it under its own name: `notes.md`, a `notes` folder, or
`notes.zip`. The window lists what was written. Two things to know:

- **A name the folder already has is never overwritten.** That conversation is
  not exported, the window says so, and the others are.
- **A bundle's links stay as they are** (`/attachments/…`), so it imports back
  as the conversation it was. Another markdown viewer will not resolve them.

**File → Import…** opens the Import window. Choose a Markdown file or a zip,
or choose a folder. The conversation opens in a window of its own, and the
Import window says what it did. What it does on the way:

- **The file's name is the conversation's name.** A name the store refuses (a
  leading dot, a `/`, `\` or `:`) is refused, and the window says why:
  rename the file and import again.
- **A name already taken is asked about, in the window:** Keep both (the
  import becomes `name-2`), Replace (the old one is kept under `.backups/`
  first) or Cancel.
- **It gets its own pi session,** so it never shares one with the conversation
  it was exported from. The first prompt sent rebuilds pi's history from the
  document, as for any document edited outside the app.
- **Attachments come with a bundle.** One whose name the workspace already
  uses for a different file is stored under a new name, and the document's
  links follow.
- **A link with no file still imports.** A markdown file imported alone
  usually has some; the window says how many and which.
- **A document of a newer format version** imports as it is and opens
  read-only, and the window says so.

A folder or a zip that is not a bundle — no `.md` at its top, more than one,
or a symbolic link anywhere in a zip — is refused, and the window says why.

## 3. When something is wrong

| Symptom | Likely cause |
|---|---|
| `cargo: not found` | §0's PATH line is missing |
| `Port 5190 is already in use` | A Vite from an earlier run is still up, and `strictPort` makes that fatal rather than silently moving the server somewhere Tauri is not looking. `lsof -ti:5190 \| xargs kill` |
| The window opens empty, no error | A page-side throw — look for `PAGE` in the terminal, or in `~/Library/Logs/ch.divergenz.piary/piary.log` for a build launched from Finder (`packaging.md` §5) |
| A command rejects with "not allowed" | Its grant is missing from `src-tauri/capabilities/default.json`. Tauri denies every ungranted command, core ones included, and it fails silently in the page |
| A prompt does nothing | `pi --version` first; then whether pi is authenticated (`pi` in a terminal) |
| Capture starts and delivers nothing | Not a permission problem as often as it looks. `SCStream` holds its outputs weakly and a configuration with no dimensions delivers nothing — both silently. |
| A permission that worked yesterday is denied | The rebuild changed the signature. Expected; re-grant |

## 4. The automated gates, for comparison

```sh
pnpm test:smoke    # the development loop: unit, contract, cargo test, @smoke specs
pnpm verify        # typecheck, lint, build, every node tier — the fast gate
pnpm verify:rust   # fmt, clippy, the Rust suite, bindings drift
pnpm test:e2e      # the page in a real engine (Playwright, headless)
pnpm test:app      # the real app through WebDriver — opens a window
```

`pnpm test:app` needs `pnpm app:e2e:build` first, and that binary carries the
`e2e` feature: an unauthenticated WebDriver server that must never ship. A
release build with the feature on does not compile, by design.
