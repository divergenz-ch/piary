// The `terminal` live view: where a command's output appears while it runs.
//
// Registered as a LIVE view (src/document/live-views.ts), not a static template,
// because its content arrives over time — which is the point: before this, a tool's
// output reached the document only at `message_end`, so a sixty-second command
// rendered nothing at all until it finished.
//
// Output renders through a real xterm.js grid rather than an escape-stripped
// <pre>, so colour, cursor addressing, spinners and in-place redraws come out
// right instead of collapsing into run-together text or literal `ESC[32m`. The
// alternative was tried first in the prototype this pattern comes from, and its
// own note on the SGR parser it replaced is the argument: a parser "is not a
// terminal emulator."
//
// THE ONLY FILE THAT IMPORTS XTERM. Same containment rule as `src/notebook/` for
// notebook-kit (docs/notebook-cells.md): API churn in a renderer stops at one
// boundary.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { registerLiveView, type LiveView, type LiveViewHost } from "../document/live-views.ts";

/** The tallest a panel gets: 24 rows, the classic terminal height.
 *
 *  The grid is this size for the whole run, and so is the tty a PTY-backed command
 *  finds. What grows is the part on SHOW — the panel reveals rows as output reaches
 *  them, so a one-line `echo` does not open a screen-high panel and then collapse
 *  it. The grid cannot grow with the output instead, because a program draws to the
 *  tty it was given: `top` in a one-row tty draws one row, and never the second that
 *  would have earned it another. */
const RUN_ROWS = 24;

/** Opened at the narrowest grid xterm allows, then fitted.
 *
 *  The panel has no width of its own — it fills the editor's content, and that
 *  content is as wide as its widest thing. An xterm opening at the default 80
 *  columns PUSHES the content out to 80 columns, and the re-fit then measures that
 *  and agrees with it. The wrong answer is stable, and invisible on a wide window.
 *  Opening at 2 leaves nothing to push with. */
const OPEN_COLS = 2;

const FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** How long after an Escape a second one still counts as the leave gesture. */
const ESC_EXIT_MS = 600;

/** How much output a panel keeps reachable. The full output is in the run's own
 *  `pi:result` fence, which is the record; this is what stays scrollable. */
const SCROLLBACK = 5000;

/** xterm paints its own opaque background, so the panel cannot inherit the page's
 *  with alpha — these are the page's surface pre-composited, which keeps the grid
 *  flush with the document instead of reading as a lighter box inside it. */
function xtermTheme(dark: boolean) {
	return dark
		? { background: "#1a1a1c", foreground: "#e8e8ea", cursor: "#e8e8ea", selectionBackground: "#3a3a40" }
		: { background: "#f3f3f3", foreground: "#1d1d1f", cursor: "#1d1d1f", selectionBackground: "#cfe0ff" };
}

const prefersDark = (): boolean =>
	typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

class XtermView implements LiveView {
	readonly el: HTMLElement;
	/** The emulator, for tests. A declared harness seam, not a reach through TS's
	 *  erased `private` (ADR 0008): xterm cannot run under jsdom, so everything about
	 *  the grid is asserted in a real browser, and the two engines render it
	 *  differently — WebKit draws spans, Chromium draws a canvas and leaves the row
	 *  divs empty. The BUFFER is the emulator's own answer and is identical in both,
	 *  so it is what `e2e/terminal.spec.ts` asserts on. */
	readonly terminal: Terminal;
	readonly #host: HTMLElement;
	readonly #hostApi: LiveViewHost;
	readonly #fit: FitAddon;
	readonly #ro: ResizeObserver | null = null;
	/** Cumulative text already rendered, so a snapshot write can send only the new
	 *  tail instead of redrawing the screen (see `write`). */
	#written = "";
	/** Whether the grid has been fitted to the panel at least once. */
	#fitted = false;
	#live = true;
	#disposed = false;
	/** Rows of the grid on show. Grows with the output while the run is live. */
	#revealed = 1;
	#lastEscape = 0;

	constructor(host: LiveViewHost) {
		this.#hostApi = host;
		this.el = document.createElement("div");
		this.el.className = "doc-terminal";
		// A rendered surface inside a document that is editable everywhere else.
		this.el.contentEditable = "false";
		// Which kind of panel this is, said out loud. A reader needs to know whether
		// the thing in front of them takes a keystroke, and the two look identical
		// otherwise.
		const label = document.createElement("div");
		label.className = "doc-terminal-label";
		label.textContent = host.interactive ? "terminal" : "output";
		this.#host = document.createElement("div");
		this.#host.className = "doc-terminal-host";
		this.el.append(label, this.#host);
		if (!host.interactive) this.el.classList.add("doc-terminal-readonly");

		this.terminal = new Terminal({
			fontFamily: FONT,
			fontSize: 13,
			rows: RUN_ROWS,
			cols: OPEN_COLS,
			theme: xtermTheme(prefersDark()),
			cursorBlink: false,
			// A cursor is an invitation to type. An output panel has no stdin anyone
			// here can reach, so it must not show one.
			cursorInactiveStyle: host.interactive ? "outline" : "none",
			// Read-only in xterm's own terms as well as ours: it stops the emulator
			// echoing or reacting to keys, while leaving the text selectable for copy.
			disableStdin: !host.interactive,
			// An output panel is fed pipe output, whose lines end in a bare `\n`; xterm
			// would move down without returning to the first column. A pty already
			// sends `\r\n`, and its programs own the cursor, so its bytes are left alone.
			convertEol: !host.interactive,
			allowProposedApi: true,
			scrollback: SCROLLBACK,
		});
		this.#fit = new FitAddon();
		this.terminal.loadAddon(this.#fit);
		this.terminal.open(this.#host);

		// Keystrokes go back to whatever is producing this view — but only when there
		// is something there to take them. Two gates, and both are needed:
		// `interactive` is about the KIND of panel (an agent's output has no stdin
		// to reach), `#live` is about its STATE (a finished command has none either).
		// Without the first, typing into an agent's panel POSTed input for a pty that
		// was never opened and the message was silently dropped — a cursor in a panel
		// that cannot accept it. The text stays selectable for copy either way.
		this.terminal.onData((data) => {
			if (this.#hostApi.interactive && this.#live) this.#hostApi.send({ type: "input", data });
		});

		// The way back to the prose for a panel that has taken the keyboard. Said
		// twice over, because a program may want the first Escape: the bare gesture
		// acts on the SECOND one, so the first has already gone through to the
		// program.
		this.terminal.attachCustomKeyEventHandler((e) => {
			// Nothing to hand back when the panel never took the keyboard.
			if (!this.#hostApi.interactive) return true;
			if (e.type !== "keydown" || e.key !== "Escape") return true;
			const since = Date.now() - this.#lastEscape;
			this.#lastEscape = Date.now();
			if (since > ESC_EXIT_MS) return true; // first tap: the program's
			this.#hostApi.focusEditor();
			return false;
		});

		// The grid follows the editor's width, so a program that lays out to COLUMNS
		// gets the width the reader actually sees.
		if (typeof ResizeObserver === "function") {
			this.#ro = new ResizeObserver(() => this.#refit());
			this.#ro.observe(this.#host);
		}
	}

	write(data: unknown) {
		if (this.#disposed) return;
		// Fit before the first byte, not only when the ResizeObserver happens to
		// fire. The grid opens at OPEN_COLS so it cannot push the editor wide, and
		// output written at that width is wrapped into a 2-column column — which is
		// what happens when the first write beats the observer, and it is permanent
		// for that output because the bytes are already in the buffer.
		if (!this.#fitted) this.#refit();
		const text = typeof data === "string" ? data : String(data ?? "");
		// A terminal the user types into is fed by its pty, a byte STREAM: each chunk
		// is new bytes and is appended as it comes. Read as a snapshot, every echoed
		// key would fail to extend the last chunk and reset the screen.
		if (this.#hostApi.interactive) {
			this.terminal.write(text);
			this.#reveal();
			return;
		}
		// `partialResult` is a CUMULATIVE snapshot (pi's bash tool snapshots rather
		// than diffing), so the new bytes are the tail past what was already
		// written. Writing the whole snapshot each time would redraw the screen and
		// make a terminal's own cursor control meaningless.
		//
		// When the snapshot is NOT an extension of what came before — a program
		// redrawing, or output the far end truncated — the whole thing is written and
		// the screen reset, because a tail diff would be nonsense.
		if (text === this.#written) return;
		if (text.startsWith(this.#written)) {
			this.terminal.write(text.slice(this.#written.length));
		} else {
			this.terminal.reset();
			this.terminal.write(text);
		}
		this.#written = text;
		this.#reveal();
	}

	settle() {
		if (this.#disposed) return;
		this.#live = false;
		this.el.classList.add("doc-terminal-settled");
		// The command finished: show the rows it actually used rather than leaving a
		// tall blank grid under a two-line result.
		this.#revealed = RUN_ROWS;
		this.#clip();
		this.#hostApi.measure();
	}

	dispose() {
		if (this.#disposed) return;
		this.#disposed = true;
		this.#ro?.disconnect();
		this.terminal.dispose();
		this.el.remove();
	}

	/** Grow the shown part of the grid as output reaches it. */
	#reveal() {
		if (this.#disposed || !this.#live || this.#revealed >= RUN_ROWS) return;
		// `buffer.active.length` counts written rows including scrollback, which is
		// the cheap answer; the expensive one would walk 5000 lines per chunk.
		const used = Math.min(RUN_ROWS, Math.max(1, this.terminal.buffer.active.length));
		if (used <= this.#revealed) return;
		this.#revealed = used;
		this.#clip();
		this.#hostApi.measure();
	}

	/** Clip the host to `#revealed` rows, or show the whole grid once it is all
	 *  revealed. xterm sizes `.xterm-screen` to the grid's pixel height, so one row
	 *  is that over `rows`; before the renderer has measured a font there is no
	 *  height, and the clip waits for the next write. */
	#clip() {
		if (!this.#live || this.#revealed >= RUN_ROWS) {
			this.#host.style.height = "";
			return;
		}
		const screen = this.#host.querySelector<HTMLElement>(".xterm-screen");
		const cell = screen ? screen.offsetHeight / this.terminal.rows : 0;
		this.#host.style.height = cell > 0 ? `${Math.round(this.#revealed * cell)}px` : "";
	}

	#refit() {
		if (this.#disposed) return;
		// An unlaid-out host has no width, and fitting against it throws inside the
		// addon's own measurement. Nothing to report until the panel is on screen.
		if (!this.#host.clientWidth) return;
		try {
			this.#fit.fit();
		} catch {
			return; // mid-layout: the next observation fits it
		}
		this.#fitted = true;
		// Only a real pty has a winsize to set; an output panel's grid is ours alone.
		if (this.#hostApi.interactive) this.#hostApi.send({ type: "resize", cols: this.terminal.cols, rows: this.terminal.rows });
	}
}

registerLiveView("terminal", (_id, host) => new XtermView(host));
