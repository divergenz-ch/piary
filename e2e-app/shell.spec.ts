// The real app, driven from outside. Layer 4 (docs/TEST_ARCHITECTURE.md §6).
//
// What belongs here is what needs the real shell and nothing a cheaper layer
// can reach: the window exists, IPC round-trips through the real boundary, a
// PTY runs a real program, the capture sidecar starts and answers.
//
// What does NOT belong here, and must not be added:
//
//   - **Typing, or any chord.** WebDriver's macOS keyboard cannot deliver text
//     or `Mod-Shift-<letter>` reliably (ADR 0014). A spec that typed would pass
//     or fail on the driver rather than on the app. Keys are asserted as data
//     in `tests/unit/keymap.test.ts` and as real events in `e2e/app-page.spec.ts`.
//   - **Anything about the canvas's behaviour.** The page layer has a real
//     engine and is fifty times faster.
//
// A spec here that could have been written one layer down is a slow test that
// opens a window for nothing.
//
// `browser`, `$`, `$$` and `expect` are imported rather than left ambient:
// `pnpm typecheck` checks this file (tsconfig.app-e2e.json), and an ambient-only
// spec would be unchecked — the gap ADR 0012 exists to close. Mocha's own
// `describe`/`it` stay ambient, which is how its types are published.
import { realpathSync } from "node:fs";
import { $, $$, browser, expect } from "@wdio/globals";

/** Whether the one spec that spends a real model call is turned off.
 *
 *  `true` and `1` both count, because both are what a person types. Anything
 *  else — including `0`, `false` and an empty value — leaves it ON: the default
 *  has to be the covered one, since a check nobody runs protects nothing. */
const DISABLED = ["1", "true"].includes((process.env["PI_E2E_DISABLED"] ?? "").trim().toLowerCase());

/** Runs an IPC command in the page, the way the page itself would. */
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
	// The outcome is resolved to a VALUE inside the page and the promise chain
	// is returned, rather than relying on an `async` function body being awaited
	// for us. A refusal has to arrive as data: a rejection crossing the driver
	// boundary becomes an opaque WebDriverError, and the refusal MESSAGES are
	// what two of these specs assert on — so a rejected invoke would fail the
	// spec at the call rather than being the thing it measures.
	return browser.execute(
		(cmd: string, params: Record<string, unknown>) => {
			const internals = (
				window as unknown as { __TAURI_INTERNALS__?: { invoke: (c: string, a: unknown) => Promise<unknown> } }
			).__TAURI_INTERNALS__;
			if (!internals) return Promise.resolve({ error: "not running inside the app" });
			return internals.invoke(cmd, params).then(
				(value: unknown) => ({ value }),
				(error: unknown) => ({ error: String(error) }),
			);
		},
		command,
		args,
	) as Promise<T>;
}

/** Closes the current window and waits until the driver no longer lists it,
 *  then returns to `back`. Moving on while the driver is still tearing the
 *  window down can leave it blind to the next window the app opens. */
async function closeAndReturn(back: string): Promise<void> {
	const closing = await browser.getWindowHandle();
	await browser.closeWindow();
	await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes(closing), {
		timeout: 15_000,
		timeoutMsg: "the closed window is still listed",
	});
	await browser.switchToWindow(back);
}

/** Unwraps what `invoke` returned, failing the spec on the error branch. */
function valueOf<T>(result: { value?: T; error?: string }): T {
	if (result.error !== undefined) throw new Error(result.error);
	return result.value as T;
}

/** How long a window that must NOT open is given to appear. Windows are Rust's
 *  to create and nothing is emitted for one not made, so a negative about a
 *  second window has no barrier but time; this is the one place it waits. */
const SECOND_WINDOW_GRACE_MS = 1000;

describe("the app's shell", () => {
	it("opens a window with the canvas in it", async () => {
		// The floor: a real WKWebView, a real CodeMirror. Everything below
		// depends on the page having booted.
		await browser.waitUntil(async () => (await $$(".cm-line").length) > 0, {
			timeoutMsg: "the canvas never rendered a line in the real window",
		});
		await expect($(".cm-editor")).toBeExisting();
	});

	it("round-trips a document through the real IPC boundary", async () => {
		// The page layer stubs this boundary; here it is the actual one, which is
		// the only thing this spec is for.
		const id = `app-spec-${Date.now()}`;
		const body = "# Written by the app spec\n";
		valueOf(await invoke<{ value?: null; error?: string }>("docs_write", { id, content: body }));
		const read = valueOf(await invoke<{ value?: string | null; error?: string }>("docs_read", { id }));
		expect(read).toBe(body);
		const list = valueOf(await invoke<{ value?: string[]; error?: string }>("docs_list"));
		expect(list).toContain(id);
	});

	it("persists what the canvas holds, through the real store", async () => {
		// The page layer proves the wiring: an edit raises `doc-change` and the
		// host hands it to `docs_write`. What only this layer can prove is that the
		// same call reaches the real store and comes back — no stub in between.
		//
		// Driven through the element's own API rather than by typing: WebDriver's
		// macOS keyboard cannot deliver text reliably (ADR 0014), and a spec that
		// typed would be asserting the driver. The keystroke half is
		// `e2e/flows.spec.ts`.
		const body = `<!-- you -->\n\nsaved by the app spec ${Date.now()}\n`;
		await browser.execute((text: string) => {
			const chat = document.querySelector("document-chat") as unknown as {
				setDocument(md: string): void;
				edit(resolve: (md: string) => { changes: { from: number; insert: string }; caret: number }): void;
			};
			chat.setDocument(text);
			// An authored edit, so the save path runs as it does for a writer —
			// `setDocument` is a load and deliberately does not schedule one.
			chat.edit((md) => ({ changes: { from: md.length, insert: "x" }, caret: md.length + 1 }));
		}, body);

		// The save is debounced in the canvas: wait for it to land, not past it.
		// `welcome` is this window's own document id (`app/main.ts`), which is what
		// makes this the canvas's save rather than a synthetic write.
		const stored = async () => valueOf(await invoke<{ value?: string | null; error?: string }>("docs_read", { id: "welcome" }));
		await browser.waitUntil(async () => (await stored())?.includes("saved by the app spec") ?? false, {
			timeout: 10_000,
			timeoutMsg: "the canvas's save never reached the store",
		});
	});

	// A `function`, not an arrow: `this.skip()` is how mocha records a test as
	// pending, where a bare `return` would record it as passed.
	it("answers a real prompt from a real pi, into the document", async function () {
		// The whole loop, with nothing stubbed: a prompt leaves the canvas, a real
		// `pi --mode rpc` answers it, and the answer lands in the document through
		// the real IPC boundary. Every other flow spec scripts pi
		// (`e2e/flows.spec.ts`) so it can run in CI for free; this one is the
		// smoke test that the boundary itself works, and it is the only spec in
		// the repo that spends a model call.
		//
		// Skipped loudly rather than silently, both ways: a silent skip is a green
		// run that covered nothing (docs/TEST_ARCHITECTURE.md §4).
		//
		// On by default, because the boundary it covers is the product and a check
		// nobody runs protects nothing. `PI_E2E_DISABLED=1` turns it off for a run
		// that must not spend a model call — a machine on someone else's key, a
		// metered CI job, a quick loop over the other specs.
		if (DISABLED) {
			console.warn("skipped: PI_E2E_DISABLED is set, so the live model call was not made");
			this.skip();
		}
		const models = valueOf(await invoke<{ value?: string; error?: string }>("pi_which"));
		if (!models) {
			console.warn("skipped: no pi on PATH, so there is no real session to answer a prompt");
			this.skip();
		}

		// The page's OWN session, driven through the page's own send path. A side
		// session started here would answer into nothing: `Turn` relays only the
		// sid it was constructed with (`app/main.ts` — "welcome" for a window with
		// no `?doc=`), so events for any other session are filtered out and the
		// document never moves. That cost a debugging cycle; it is why this spec
		// raises `doc-send` rather than calling `pi_send` itself.

		// Driven through the element's own API: WebDriver's macOS keyboard cannot
		// deliver text reliably (ADR 0014), so the keystroke half of this loop is
		// layer 3's and this half is the boundary's.
		//
		// The page's own `onPiEvent` listener is already relaying this session's
		// events into the document — that is the thing under test — so all this
		// does is seed the prompt, open the turn, send, and then watch the
		// document until the answer appears.
		await browser.execute(() => {
			const chat = document.querySelector("document-chat") as unknown as {
				setDocument(md: string): void;
				getDocument(): string;
				dispatchEvent(event: Event): boolean;
			};
			chat.setDocument("<!-- you -->\n\nReply with exactly: OK\n");
			// The same event a Mod-Enter raises. The host starts the session, opens
			// the turn and relays the answer — all of which is the thing under test.
			chat.dispatchEvent(
				new CustomEvent("doc-send", {
					// `at` is where the caret was, and the turn opens after it. 0 would
					// open the region ABOVE the prompt, which is how the first run of
					// this spec produced a document with the answer before the question.
					detail: {
						text: "Reply with exactly: OK",
						followUp: false,
						newBlock: true,
						at: (chat as unknown as { getDocument(): string }).getDocument().trimEnd().length,
					},
					bubbles: true,
				}),
			);
		});

		// A real model, so a real wait. `waitUntil` polls the document rather than
		// sleeping a fixed time, which is both faster when it answers quickly and
		// honest when it does not.
		const readDoc = () =>
			browser.execute(
				() => (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument(),
			);
		let answered = "";
		try {
			await browser.waitUntil(
				async () => {
					answered = await readDoc();
					// Prose between the agent's marker and whatever follows it. The
					// first version of this asked for "any non-space after the marker"
					// and matched the NEXT marker, so it went green against a document
					// where the model had answered nothing at all.
					const body = answered.split("<!-- pi -->")[1] ?? "";
					return body.replace(/<!--[\s\S]*$/, "").trim().length > 0;
				},
				{ timeout: 60_000, interval: 1_000, timeoutMsg: "a real pi never answered the prompt" },
			);
		} finally {
			answered = answered || (await readDoc());
		}

		// The window's own session is stopped with the window; nothing to clean up
		// here, and stopping "welcome" would reach into the app's own state.

		// What the model said is its own business; that something it said reached
		// the document, attributed, is the boundary working. Asserting the marker
		// alone is not enough — the turn writes that itself before pi replies.
		expect(answered).toContain("<!-- pi -->");
		expect(answered).toContain("Reply with exactly: OK");
		const body = (answered.split("<!-- pi -->")[1] ?? "").replace(/<!--[\s\S]*$/, "").trim();
		expect(body.length).toBeGreaterThan(0);
		// Under the prompt, not above it — the ordering a reader sees.
		expect(answered.indexOf("Reply with exactly: OK")).toBeLessThan(answered.indexOf("<!-- pi -->"));
	});

	it("runs a real program on a PTY and closes it again", async () => {
		// What this layer can see that no other can: a PTY opened through the
		// real IPC boundary, in the real app, and closed again.
		//
		// What it deliberately does NOT assert is the OWNERSHIP REFUSAL. A
		// command that returns Err reaches the driver as a protocol-level
		// WebDriverError before any page handler sees it, so the refusal's
		// message cannot be read here at all — the spec would fail at the call
		// instead of measuring it. Those assertions live in
		// `src-tauri/src/pty.rs`, where the two refusals are compared for being
		// identical (ADR 0013), which is the property that matters and is
		// cheaper to test there anyway.
		const termId = `app-spec-term-${Date.now()}`;
		valueOf(
			await invoke<{ value?: null; error?: string }>("pty_open", {
				request: { sid: "app-spec", termId, command: "/bin/sh", pi: false, args: [], cwd: "/tmp", cols: 80, rows: 24 },
			}),
		);
		valueOf(await invoke<{ value?: null; error?: string }>("pty_write", { sid: "app-spec", termId, data: "\n" }));
		valueOf(await invoke<{ value?: null; error?: string }>("pty_close", { sid: "app-spec", termId }));
	});

	it("New Terminal opens the user's login shell in the workspace", async () => {
		// The page's own path, end to end: the menu's event (delivered through
		// Tauri's emit, so the page's `onMenu` subscription is what opens it),
		// the panel the page writes, Rust resolving the empty command and cwd to
		// the login shell and the workspace, and the shell's output routed back
		// into that panel. No typing: the command goes in through `pty_write`.
		valueOf(await invoke<{ value?: null; error?: string }>("plugin:event|emit", { event: "menu", payload: "new-terminal" }));
		const termId = await browser.waitUntil(
			async () =>
				(await browser.execute(() => {
					const md = (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument();
					return /<!-- pi:view terminal #(term-[a-z0-9]+) -->/.exec(md)?.[1] ?? "";
				})) || false,
			{ timeout: 10_000, timeoutMsg: "New Terminal wrote no terminal panel" },
		);
		const sid = await browser.execute(() => (new URL(location.href).searchParams.get("doc") ? "scratch" : "welcome"));
		valueOf(
			await invoke<{ value?: null; error?: string }>("pty_write", {
				sid,
				termId,
				data: "echo SHELL-OK $CLICOLOR_FORCE $GIT_PAGER; pwd\n",
			}),
		);
		/** The panel's grid, read through xterm's buffer. */
		const grid = () =>
			browser.execute(async (id: string) => {
				const chat = document.querySelector("document-chat") as unknown as {
					liveView(id: string): {
						terminal: { write(d: string, cb: () => void): void; buffer: { active: { length: number; getLine(i: number): { translateToString(trim: boolean): string } | undefined } } };
					} | null;
				};
				const view = chat.liveView(id);
				if (!view) return "";
				await new Promise<void>((resolve) => view.terminal.write("", resolve));
				const buffer = view.terminal.buffer.active;
				return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? "").join("\n");
			}, termId);
		await browser.waitUntil(async () => /SHELL-OK 1 cat/.test(await grid()), {
			timeout: 15_000,
			timeoutMsg: "the login shell never answered in its panel",
		});
		// The workspace is the one `wdio.conf.ts` names (`PI_CWD`), beside the
		// spec's documents. macOS's $TMPDIR is under /var, a symlink to
		// /private/var, and the shell may print either form.
		const workspace = realpathSync(process.env["PI_CWD"]!);
		const printed = (await grid())
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.startsWith("/"));
		const resolved = printed.map((line) => {
			try {
				return realpathSync(line);
			} catch {
				return line;
			}
		});
		expect(resolved).toContain(workspace);
		valueOf(await invoke<{ value?: null; error?: string }>("pty_close", { sid, termId }));
	});

	it("opens a document in a window of its own, once, and its close stops that window's pi", async () => {
		// One window per document (`windows::label_for`): asking twice focuses
		// the window the first ask made rather than opening another.
		const main = await browser.getWindowHandle();
		const before = await browser.getWindowHandles();
		valueOf(await invoke<{ value?: null; error?: string }>("open_document", { docId: "probe-open" }));
		valueOf(await invoke<{ value?: null; error?: string }>("open_document", { docId: "probe-open" }));
		await browser.waitUntil(async () => (await browser.getWindowHandles()).length === before.length + 1, {
			timeout: 10_000,
			timeoutMsg: "open_document opened no window",
		});
		await browser.pause(SECOND_WINDOW_GRACE_MS);
		const after = await browser.getWindowHandles();
		expect(after.length).toBe(before.length + 1);
		const opened = after.find((handle) => !before.includes(handle))!;

		// The new window shows that document, and a session started from it is
		// that window's: closing it stops the pi (ADR 0019 §2).
		await browser.switchToWindow(opened);
		await browser.waitUntil(async () => (await browser.execute(() => !!document.querySelector("document-chat .cm-line"))) === true, {
			timeout: 15_000,
			timeoutMsg: "the document window never mounted its canvas",
		});
		expect(await browser.execute(() => new URL(location.href).searchParams.get("id"))).toBe("probe-open");
		valueOf(await invoke<{ value?: null; error?: string }>("pi_start", { sid: "probe-open", args: [] }));
		expect(valueOf(await invoke<{ value?: boolean; error?: string }>("pi_running", { sid: "probe-open" }))).toBe(true);
		await closeAndReturn(main);
		await browser.waitUntil(async () => (await browser.getWindowHandles()).length === before.length, {
			timeout: 15_000,
			timeoutMsg: "the document window did not close",
		});
		await browser.waitUntil(
			async () => valueOf(await invoke<{ value?: boolean; error?: string }>("pi_running", { sid: "probe-open" })) === false,
			{ timeout: 15_000, timeoutMsg: "closing the document's window left its pi running" },
		);
	});

	it("a subsession card's open shows its child in one window, and opening again focuses it", async () => {
		// A WebDriver click, not typing: the card's own button raising its own
		// event, through the page's table, to `open_document`.
		const child = "probe-child";
		const card = `<!-- you -->\n\n<!-- pi:view subsession #${child} -->\n\n\`\`\`json\n{"sid":"${child}","title":"probe"}\n\`\`\`\n\n<!-- you -->\n\n`;
		const main = await browser.getWindowHandle();
		const before = await browser.getWindowHandles();
		await browser.execute((md: string) => {
			(document.querySelector("document-chat") as unknown as { setDocument(md: string): void }).setDocument(md);
		}, card);
		const open = await $(`.doc-subsession[data-sid="${child}"] .doc-subsession-open`);
		await open.waitForDisplayed({ timeout: 10_000 });
		await open.click();
		await browser.waitUntil(async () => (await browser.getWindowHandles()).length === before.length + 1, {
			timeout: 10_000,
			timeoutMsg: "open showed the child in no window",
		});
		await browser.switchToWindow(main);
		await (await $(`.doc-subsession[data-sid="${child}"] .doc-subsession-open`)).click();
		await browser.pause(SECOND_WINDOW_GRACE_MS);
		const after = await browser.getWindowHandles();
		expect(after.length).toBe(before.length + 1);
		const opened = after.find((handle) => !before.includes(handle))!;
		await browser.switchToWindow(opened);
		expect(await browser.execute(() => new URL(location.href).searchParams.get("id"))).toBe(child);
		await closeAndReturn(main);
	});

	// What the page does with `show_document`'s answer is `e2e/app-page.spec.ts`'s;
	// this holds Rust's record of which window shows what, which only real
	// windows can. The switch happens in a window of its own, so the main
	// window still shows its document for the cases after this one.
	it("Rust knows which window shows a conversation, and a window that switches takes its record along", async () => {
		const main = await browser.getWindowHandle();
		/** `docId`'s page has booted in the driver's window: its canvas is up. */
		const booted = async (docId: string) =>
			(await browser.execute((id: string) => new URL(location.href).searchParams.get("id") === id && !!document.querySelector("document-chat .cm-line"), docId)) === true;
		/** Opens `docId` in a window of its own, moves the driver to it, and
		 *  waits for its page to boot, so the page's listeners are there. */
		const openWindow = async (docId: string): Promise<string> => {
			const before = await browser.getWindowHandles();
			valueOf(await invoke<{ value?: null; error?: string }>("open_document", { docId }));
			await browser.waitUntil(async () => (await browser.getWindowHandles()).length === before.length + 1, {
				timeout: 10_000,
				timeoutMsg: `open_document opened no window for ${docId}`,
			});
			const opened = (await browser.getWindowHandles()).find((handle) => !before.includes(handle))!;
			await browser.switchToWindow(opened);
			await browser.waitUntil(() => booted(docId), { timeout: 15_000, timeoutMsg: `${docId}'s page never booted` });
			return opened;
		};
		const shownElsewhere = async (docId: string) => valueOf(await invoke<{ value?: boolean; error?: string }>("show_document", { docId }));

		const shown = await openWindow("probe-shown");
		const switcher = await openWindow("probe-switcher");
		// Asked from the switcher: another window shows the first, the asker's
		// own is not elsewhere, and no window shows the third.
		expect(await shownElsewhere("probe-shown")).toBe(true);
		expect(await shownElsewhere("probe-switcher")).toBe(false);
		expect(await shownElsewhere("probe-free")).toBe(false);

		await browser.execute(() => document.dispatchEvent(new CustomEvent("piary-switch", { detail: { id: "probe-free" } })));
		await browser.waitUntil(() => booted("probe-free"), { timeout: 15_000, timeoutMsg: "the window never showed the conversation it switched to" });
		await browser.switchToWindow(main);
		await browser.waitUntil(async () => (await shownElsewhere("probe-free")) === true, {
			timeout: 10_000,
			timeoutMsg: "Rust never learned the switched window shows probe-free",
		});
		// The switched window left it.
		expect(await shownElsewhere("probe-switcher")).toBe(false);

		await browser.switchToWindow(shown);
		await closeAndReturn(switcher);
		await closeAndReturn(main);
	});

	it("deleting a conversation stops its pi, closes a window showing it, and removes its document", async () => {
		const main = await browser.getWindowHandle();
		const before = await browser.getWindowHandles();
		valueOf(await invoke<{ value?: null; error?: string }>("docs_write", { id: "probe-del", content: "<!-- you -->\n\ndoomed\n\n" }));
		valueOf(await invoke<{ value?: null; error?: string }>("open_document", { docId: "probe-del" }));
		await browser.waitUntil(async () => (await browser.getWindowHandles()).length === before.length + 1, {
			timeout: 10_000,
			timeoutMsg: "open_document opened no window",
		});
		await browser.switchToWindow((await browser.getWindowHandles()).find((handle) => !before.includes(handle))!);
		valueOf(await invoke<{ value?: null; error?: string }>("pi_start", { sid: "probe-del", args: [] }));
		await browser.switchToWindow(main);
		expect(valueOf(await invoke<{ value?: boolean; error?: string }>("pi_running", { sid: "probe-del" }))).toBe(true);

		valueOf(await invoke<{ value?: null; error?: string }>("delete_conversation", { id: "probe-del" }));
		await browser.waitUntil(async () => (await browser.getWindowHandles()).length === before.length, {
			timeout: 15_000,
			timeoutMsg: "the window showing the deleted conversation stayed open",
		});
		expect(valueOf(await invoke<{ value?: boolean; error?: string }>("pi_running", { sid: "probe-del" }))).toBe(false);
		expect(valueOf(await invoke<{ value?: string | null; error?: string }>("docs_read", { id: "probe-del" }))).toBe(null);
	});

	it("the menu's chords are read back from the system, by the id each item emits", async () => {
		const chords = valueOf(await invoke<{ value?: Record<string, string>; error?: string }>("menu_chords"));
		expect(chords["new-document"]).toBe("⌘N");
		expect(chords["commands"]).toBe("⌘K");
		expect(chords["toggle-focus"]).toBe("⇧⌘F");
		expect(chords["choose-model"]).toBe("⌥P");
		expect(chords["toggle-face"]).toBe("⌥⌘F");
		// Which key is this Mac's keyboard layout's to say: ⌘, on a U.S. one,
		// ⌘Ö on a Turkish one (ADR 0051).
		expect(chords["settings"]).toMatch(/^⌘.$/u);
		expect(chords["stop"]).toMatch(/^⌘.$/u);
		// An item with no accelerator has no chord.
		expect(chords["send"]).toBeUndefined();
		expect(chords["import"]).toBeUndefined();
	});

	it("Settings opens one Preferences window, and a change made in it is kept and reaches another window", async () => {
		// A native menu cannot be clicked from here; the event its click emits
		// to the focused page can (ADR 0048).
		const main = await browser.getWindowHandle();
		const before = await browser.getWindowHandles();
		// What this window hears of the change, the way `src/bridge.ts` listens.
		await browser.execute(() => {
			const internals = (
				window as unknown as { __TAURI_INTERNALS__: { invoke(c: string, a: unknown): Promise<unknown>; transformCallback(f: (e: { payload: unknown }) => void): number } }
			).__TAURI_INTERNALS__;
			const heard: unknown[] = ((window as unknown as { __preferencesHeard: unknown[] }).__preferencesHeard = []);
			return internals.invoke("plugin:event|listen", {
				event: "preferences-changed",
				target: { kind: "Any" },
				handler: internals.transformCallback((event) => heard.push(event.payload)),
			});
		});
		expect(valueOf(await invoke<{ value?: { cellWorkPulse: boolean }; error?: string }>("preferences_read"))).toEqual({ cellWorkPulse: true, face: false, faceExplained: false, faceCamera: "", faceTuning: { intensity: "C", minMs: 500, yaw: 12, pitch: 10 }, faceSpeaks: false, updateCheck: true, updateDismissed: "", piPath: "" });

		// The click as the page hears it, then the command the page answers
		// it with: asked twice, there is one window.
		valueOf(await invoke<{ value?: null; error?: string }>("plugin:event|emit", { event: "menu", payload: "settings" }));
		await browser.waitUntil(async () => (await browser.getWindowHandles()).length === before.length + 1, {
			timeout: 10_000,
			timeoutMsg: "open_preferences opened no window",
		});
		valueOf(await invoke<{ value?: null; error?: string }>("open_preferences"));
		const after = await browser.getWindowHandles();
		await browser.switchToWindow(after.find((handle) => !before.includes(handle))!);
		const pulse = () => browser.execute(() => document.querySelector<HTMLInputElement>('input[data-preference="cellWorkPulse"]')?.checked ?? null);
		await browser.waitUntil(async () => (await pulse()) === true, { timeout: 15_000, timeoutMsg: "the Preferences window never showed the pulse switch, on" });

		// Clicked in the page: the window is click-through under the harness.
		await browser.execute(() => document.querySelector<HTMLInputElement>('input[data-preference="cellWorkPulse"]')!.click());
		await browser.waitUntil(async () => (await pulse()) === false, { timeout: 10_000, timeoutMsg: "the switch never followed the change Rust kept" });

		// Asked twice, and by now a second window would have shown: there is one.
		expect((await browser.getWindowHandles()).length).toBe(before.length + 1);
		// Its close is answered at once, having nothing to write; and the other
		// window heard the change and reads it back from the file.
		await closeAndReturn(main);
		await browser.waitUntil(
			async () => (await browser.execute(() => JSON.stringify((window as unknown as { __preferencesHeard: unknown[] }).__preferencesHeard))) === '[{"cellWorkPulse":false,"face":false,"faceExplained":false,"faceCamera":"","faceTuning":{"intensity":"C","minMs":500,"yaw":12,"pitch":10},"faceSpeaks":false,"updateCheck":true,"updateDismissed":"","piPath":""}]',
			{ timeout: 10_000, timeoutMsg: "the main window never heard the preference change" },
		);
		expect(valueOf(await invoke<{ value?: { cellWorkPulse: boolean }; error?: string }>("preferences_read"))).toEqual({ cellWorkPulse: false, face: false, faceExplained: false, faceCamera: "", faceTuning: { intensity: "C", minMs: 500, yaw: 12, pitch: 10 }, faceSpeaks: false, updateCheck: true, updateDismissed: "", piPath: "" });
		// Back as it was, for the specs after this one.
		valueOf(await invoke<{ value?: null; error?: string }>("preferences_write", { preferences: { cellWorkPulse: true } }));
	});

	it("starts the capture sidecar and stops it again", async () => {
		// The sidecar is a separate process inside the bundle, so this is the
		// layer that can see whether it actually starts.
		valueOf(await invoke<{ value?: null; error?: string }>("capture_start"));
		const running = valueOf(await invoke<{ value?: boolean; error?: string }>("capture_running"));
		expect(running).toBe(true);

		valueOf(await invoke<{ value?: number | null; error?: string }>("capture_stop"));
		const after = valueOf(await invoke<{ value?: boolean; error?: string }>("capture_running"));
		// A capture grant held by a process nobody reads is the leak this
		// assertion exists for (ADR 0015).
		expect(after).toBe(false);
	});

	it("honours the overlay primitives the capture overlay needs", async () => {
		// Asked of the real window, because that is the only place the answer is
		// true: a webview in a browser has no window to make always-on-top.
		const support = valueOf(
			await invoke<{
				value?: { alwaysOnTop: boolean; clickThrough: boolean; allWorkspaces: boolean; undecorated: boolean };
				error?: string;
			}>("overlay_support"),
		);
		expect(support.alwaysOnTop).toBe(true);
		expect(support.clickThrough).toBe(true);
		expect(support.allWorkspaces).toBe(true);
		expect(support.undecorated).toBe(true);
	});
});
