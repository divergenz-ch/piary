// The terminal panel in a real engine — the ONLY layer that can test it.
//
// xterm.js does not run under jsdom at all: it calls `matchMedia` while opening and
// attaches a change listener to the result, and jsdom implements no `matchMedia`, so
// importing the view there crashes the process. The unit suite therefore asserts the
// WIRING against a stub (tests/integration/streaming-tool-output.test.ts) and everything below —
// a real grid, real rows, real colour, real scrolling — lives here.
import { expect, test } from "@playwright/test";

const DOC = "<!-- you -->\n\nrun the build\n";

/** Open the harness and stream `text` into a terminal view, returning its locator. */
async function streamInto(page: import("@playwright/test").Page, id: string, text: string) {
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(DOC)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();
	await page.evaluate(
		async ([viewId, body]) => {
			const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
			const v = chat.openStreamingView("terminal", viewId);
			if (!v) throw new Error("the terminal live view is not registered on this page");
			v.write(body);
			// xterm parses on its own queue, so the buffer is still empty on the next
			// line. An empty write with a callback is its documented flush: without it
			// every assertion below races the parser and reads a blank screen.
			await new Promise<void>((resolve) => v.terminal.write("", () => resolve()));
		},
		[id, text] as const,
	);
	return page.locator(".doc-terminal");
}

test("output renders into a real xterm grid", async ({ page }) => {
	const panel = await streamInto(page, "e2e-grid", "hello from the terminal\n");
	await expect(panel).toBeVisible();
	// `.xterm-rows` is xterm's own rendered output. Its presence is the claim that a
	// terminal emulator — not a <pre> — drew this.
	await expect(panel.locator(".xterm-rows")).toBeVisible();
	await expect(panel).toContainText("hello from the terminal");
});

test("the panel has real height and is capped, not unbounded", async ({ page }) => {
	const panel = await streamInto(page, "e2e-tall", Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n"));
	const host = panel.locator(".doc-terminal-host");
	const box = await host.boundingBox();
	// Zero under jsdom, where every rect is stubbed — which is the whole reason this
	// assertion lives in a browser.
	expect(box!.height).toBeGreaterThan(0);
	// 300 lines must not become a 300-line-tall document element: the grid is capped
	// at RUN_ROWS and the rest is scrollback.
	expect(box!.height).toBeLessThan(800);
});

test("ANSI colour is interpreted, not printed as escapes", async ({ page }) => {
	// A real SGR sequence, the kind a PTY-backed command emits — and the kind the
	// escape-stripping <pre> this replaced rendered as visible `ESC[31m` garbage.
	await streamInto(page, "e2e-colour", "\x1b[31mRED\x1b[0m plain\n");

	// Asserted through xterm's BUFFER, not its DOM. The two engines render
	// differently — WebKit draws spans, Chromium draws into a canvas and leaves the
	// row divs empty — so any assertion over `.xterm-rows span` tests which renderer
	// was picked rather than whether the colour was understood. The buffer is the
	// emulator's own answer and is identical in both.
	const cells = await page.evaluate(() => {
		const view = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat
			.liveView("e2e-colour");
		const line = view.terminal.buffer.active.getLine(0);
		const out: { ch: string; fg: number; isFg: boolean }[] = [];
		for (let i = 0; i < 12; i++) {
			const c = line.getCell(i);
			if (!c) break;
			out.push({ ch: c.getChars(), fg: c.getFgColor(), isFg: !!c.isFgPalette() });
		}
		return out;
	});

	const red = cells.find((c) => c.ch === "R");
	const plain = cells.find((c) => c.ch === "p");
	// Palette colour 1 is red. The glyph carries the attribute, which is the claim:
	// the escape became an ATTRIBUTE rather than text.
	expect(red?.fg).toBe(1);
	// A PALETTE colour, not an RGB one: `\x1b[31m` is palette index 1, and asserting
	// the kind as well as the number is what distinguishes it from a cell that happens
	// to hold 1 by other means.
	expect(red?.isFg).toBe(true);
	// And the text after the reset is not coloured.
	expect(plain?.fg).not.toBe(1);
	// The escape itself never reaches the screen.
	const text = await page.evaluate(() => {
		const view = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat
			.liveView("e2e-colour");
		return view.terminal.buffer.active.getLine(0).translateToString(true);
	});
	expect(text).toContain("RED plain");
	expect(text).not.toContain("[31m");
});

test("a carriage return overwrites its line instead of adding one", async ({ page }) => {
	// Progress output: three writes to one line. A <pre> shows all three; a terminal
	// shows the last.
	const panel = await streamInto(page, "e2e-cr", "10%\r50%\r100%\n");
	await expect(panel).toContainText("100%");
	const text = (await panel.locator(".xterm-rows").innerText()).replace(/\s+/g, " ");
	expect(text).not.toContain("10% 50%");
});

test("the grid takes the editor's width rather than forcing 80 columns", async ({ page }) => {
	const panel = await streamInto(page, "e2e-cols", "x\n");
	const cols = await page.evaluate(() => {
		const el = document.querySelector(".doc-terminal .xterm") as HTMLElement | null;
		return el ? el.clientWidth : 0;
	});
	const docWidth = await page.locator(".cm-content").evaluate((el) => el.clientWidth);
	// Opening at 80 columns pushes the content out and the re-fit then agrees with
	// it; the panel must instead fit inside the text column it lives in.
	expect(cols).toBeGreaterThan(0);
	expect(cols).toBeLessThanOrEqual(docWidth + 2);
	await expect(panel).toBeVisible();
});

test("settling keeps the output readable", async ({ page }) => {
	const panel = await streamInto(page, "e2e-settle", "build finished\n");
	await page.evaluate(() => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		chat.liveView("e2e-settle").settle();
	});
	await expect(panel).toHaveClass(/doc-terminal-settled/);
	// What a reader was watching must survive the command ending.
	await expect(panel).toContainText("build finished");
});

test("a terminal already in the document is adopted, and survives scrolling", async ({ page }) => {
	// Two properties, both only observable in a browser.
	//
	// First: a `pi:view terminal` marker already in the buffer — which is what a
	// reload or a rebuild produces — is ADOPTED by `openStreamingView` rather than
	// duplicated. Second: the panel and its content survive a scroll round-trip
	// through a long document.
	//
	// Honest about what this does NOT prove: CodeMirror destroys the widget of a line
	// outside its DRAWN viewport, and with the panel's own height plus CodeMirror's
	// generous viewport margin it could not be made to unmount here reliably. So trap
	// 2 — releasing a view from the widget's `destroy()` — is guarded by
	// `tests/integration/live-view-widget.test.ts` (dispose runs when the marker leaves and not
	// before) rather than by this spec. Do not add a `toHaveCount(0)` here and assume
	// it means something: it passed against the bug when the document was being
	// silently wiped.
	const filler = "filler paragraph.\n\n".repeat(400);
	const doc = `${DOC}\n<!-- pi:view terminal #e2e-scroll -->\n\n\`\`\`\n\`\`\`\n\n${filler}`;
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(doc)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();

	await page.evaluate(async () => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		const v = chat.openStreamingView("terminal", "e2e-scroll");
		v.write("SURVIVOR-MARKER\n");
		await new Promise<void>((r) => v.terminal.write("", () => r()));
	});
	// Adopted, not added: one panel, and the marker was not written a second time.
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	const markers = await page.evaluate(() => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		return (chat.getDocument().match(/<!-- pi:view terminal #e2e-scroll -->/g) ?? []).length;
	});
	expect(markers).toBe(1);

	const scroller = page.locator(".cm-scroller");
	await scroller.evaluate((el) => {
		el.scrollTop = el.scrollHeight;
	});
	await scroller.evaluate((el) => {
		el.scrollTop = 0;
	});

	// Still one panel, still holding what was written into it.
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	const text = await page.evaluate(() => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		return chat.liveView("e2e-scroll").terminal.buffer.active.getLine(0).translateToString(true);
	});
	expect(text).toContain("SURVIVOR-MARKER");
});

test("the user's document is never replaced by opening a terminal", async ({ page }) => {
	// The regression that cost a conversation: `openStreamingView` used the streaming
	// path, whose `[msgAnchor, tailAnchor]` region spans the whole buffer outside a
	// live turn — so opening a terminal REPLACED the document. 7619 characters became
	// 40. Guarded at the unit layer too; kept here because this is where it was found.
	const prose = `${DOC}\n${"a paragraph of the user's own writing.\n\n".repeat(50)}`;
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(prose)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();

	const sizes = await page.evaluate(() => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		const before = chat.getDocument().length;
		chat.openStreamingView("terminal", "e2e-keep");
		const after = chat.getDocument();
		return { before, after: after.length, kept: after.includes("a paragraph of the user's own writing.") };
	});
	expect(sizes.before).toBeGreaterThan(1000);
	expect(sizes.after).toBeGreaterThan(sizes.before);
	expect(sizes.kept).toBe(true);
});

test("a read-only output panel offers no cursor and swallows no keystroke", async ({ page }) => {
	// The bug this closes: `TerminalView` forwarded `onData` whenever the panel was
	// live, so typing into an AGENT's bash output POSTed input for a pty that was
	// never opened. The message was dropped at the bridge, which made it harmless and
	// invisible — but the panel showed a cursor and accepted focus, which is a promise
	// the UI cannot keep (ADR 0013: nothing can reach a running pi tool's stdin).
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(DOC)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();

	const sent: string[] = [];
	await page.exposeFunction("__record", (m: string) => void sent.push(m));
	await page.evaluate(async () => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		chat.addEventListener("live-view-send", (e: Event) => {
			void (globalThis as unknown as { __record: (m: string) => void }).__record(
				JSON.stringify((e as CustomEvent).detail.message),
			);
		});
		// `false` — a view OF a process, which is what an agent's bash output is.
		const v = chat.openStreamingView("terminal", "e2e-ro", false);
		v.write("the agent's output\n");
		await new Promise<void>((r) => v.terminal.write("", () => r()));
	});

	const panel = page.locator(".doc-terminal");
	// It says which kind it is, because the two look identical otherwise.
	await expect(panel.locator(".doc-terminal-label")).toHaveText("output");
	await expect(panel).toHaveClass(/doc-terminal-readonly/);

	// Type at it. xterm is `disableStdin` here, so nothing should leave the view.
	await panel.locator(".xterm-screen").click();
	await page.keyboard.type("rm -rf /");
	expect(sent.filter((m) => m.includes('"input"'))).toEqual([]);
	// And the output is untouched — the keystrokes were not echoed into the grid.
	const text = await page.evaluate(() => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		return chat.liveView("e2e-ro").terminal.buffer.active.getLine(0).translateToString(true);
	});
	expect(text).toContain("the agent's output");
	expect(text).not.toContain("rm -rf");
});

test("an interactive terminal does forward what is typed", async ({ page }) => {
	// The control for the spec above: the guard must not have closed the door on the
	// panel that is supposed to take input. Without this, `interactive` could be
	// hardcoded false and both specs would still pass.
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(DOC)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();

	const sent: string[] = [];
	await page.exposeFunction("__record2", (m: string) => void sent.push(m));
	await page.evaluate(async () => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		chat.addEventListener("live-view-send", (e: Event) => {
			void (globalThis as unknown as { __record2: (m: string) => void }).__record2(
				JSON.stringify((e as CustomEvent).detail.message),
			);
		});
		const v = chat.openStreamingView("terminal", "e2e-rw", true);
		v.write("$ ");
		await new Promise<void>((r) => v.terminal.write("", () => r()));
	});

	const panel = page.locator(".doc-terminal");
	await expect(panel.locator(".doc-terminal-label")).toHaveText("terminal");
	await panel.locator(".xterm-screen").click();
	await page.keyboard.type("ls");
	// Two keystrokes, two input messages, on their way to a real pty.
	expect(sent.filter((m) => m.includes('"input"')).length).toBeGreaterThanOrEqual(2);
});

test("an interactive terminal appends what its pty sends, a chunk at a time", async ({ page }) => {
	// A pty is a byte STREAM: the prompt, then each key's echo, then the output, each
	// its own chunk. An output panel is fed cumulative snapshots instead (pi's
	// `partialResult`). Read as a snapshot, every chunk here would fail to extend the
	// last one and reset the screen — a prompt that shows one letter at a time, and
	// output whose first line is wiped by the next chunk.
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(DOC)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();

	const lines = await page.evaluate(async () => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		const v = chat.openStreamingView("terminal", "e2e-stream", true);
		// Flushed after EACH chunk, as a pty's timing does: chunks arrive in separate
		// tasks and xterm parses in between. Written in one synchronous burst, the
		// writes would all queue before any parse, and a reset between them would
		// clear a buffer that was still empty — hiding the defect.
		for (const chunk of ["$ ", "l", "s", "\r\n", "file-a\r\nfile-b\r\n", "$ "]) {
			v.write(chunk);
			await new Promise<void>((r) => v.terminal.write("", () => r()));
		}
		const buffer = v.terminal.buffer.active;
		return [0, 1, 2, 3].map((i) => buffer.getLine(i).translateToString(true));
	});

	expect(lines).toEqual(["$ ls", "file-a", "file-b", "$ "]);
});

test("a terminal whose output fits shows no scrollbar, and long output still scrolls", async ({ page }) => {
	// macOS draws classic, always-visible scrollbars when a mouse is attached or
	// "Show scroll bars" is Always; headless engines draw overlay ones that take no
	// room, which is how an empty scrollbar track beside a one-screen terminal went
	// unseen here. A `::-webkit-scrollbar` rule forces the classic kind in both
	// engines, so the track is measurable as the width it takes.
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(DOC)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();
	await page.addStyleTag({ content: "::-webkit-scrollbar { width: 12px; height: 12px; background: #888; }" });

	const gutters = await page.evaluate(async () => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		const v = chat.openStreamingView("terminal", "e2e-fits", true);
		v.write("$ ls\r\na\r\nb\r\n$ ");
		await new Promise<void>((r) => v.terminal.write("", () => r()));
		// Every element in the panel that takes room for a scrollbar track.
		return [...document.querySelectorAll<HTMLElement>(".doc-terminal *")]
			.filter((el) => el.offsetWidth - el.clientWidth > 0 && getComputedStyle(el).overflowY !== "visible")
			.map((el) => el.className);
	});
	expect(gutters).toEqual([]);

	// The control: hiding a track must not have taken scrollback with it. Wheeling
	// over a terminal with more output than its grid moves it back through history.
	const viewportY = () =>
		page.evaluate(() => {
			const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
			return chat.liveView("e2e-fits").terminal.buffer.active.viewportY as number;
		});
	await page.evaluate(async () => {
		const chat = (globalThis as unknown as { __harness: { chat: Record<string, any> } }).__harness.chat;
		const v = chat.liveView("e2e-fits");
		v.write(Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\r\n"));
		await new Promise<void>((r) => v.terminal.write("", () => r()));
	});
	const atBottom = await viewportY();
	expect(atBottom).toBeGreaterThan(0);
	const box = (await page.locator(".doc-terminal .xterm-screen").boundingBox())!;
	await page.mouse.move(box.x + 40, box.y + 40);
	await page.mouse.wheel(0, -600);
	await expect.poll(viewportY).toBeLessThan(atBottom);
});
