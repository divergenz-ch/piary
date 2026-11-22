// Streaming tool output (L2): a command's output reaches the document WHILE it
// runs, through the `terminal` live view.
//
// What this guards is the asymmetry Phase 3 closed. Assistant text has had both a
// partial path (`applyAssistantPartial`) and a finalize for a long time; a tool
// result only ever had the finalize (`appendToolResult`), so a sixty-second command
// rendered nothing at all until it ended. pi was streaming the output the whole
// time — `tool_execution_update` carries a cumulative `partialResult` — and nothing
// read it.
//
// The document's own text must come out unchanged by any of this: the output lives
// in the view, not in the buffer (src/document/live-views.ts rule 3), so a rebuild
// and a reload see what they saw before the feature existed (ADR 0002).
import assert from "node:assert/strict";
import test from "node:test";
import { registerLiveView } from "../../dist/document/live-views.js";
import { mount, settle, unmount } from "../helpers/editor.ts";

// A stand-in for the real `terminal` view, NOT a mock of it: this file is about the
// WIRING — that a view is opened once per tool call, written to, settled, and that
// none of it touches the document's text. The real view is xterm.js, which cannot
// run here at all: it calls `matchMedia` during `open()` and attaches a change
// listener to the result, and jsdom implements no `matchMedia`, so loading it
// crashes the test process outright (`m.addEventListener is not a function`).
//
// That is an environment limit, not a gap in coverage: what xterm actually DOES —
// the grid, the colour, the reveal, the scroll — is geometry, which is the browser
// layer's job and is asserted in `e2e/terminal.spec.ts`. Registering the stub under
// the real name keeps this file at the layer it belongs to
// (docs/TEST_ARCHITECTURE.md §3: the thinnest layer that can express the claim).
registerLiveView("terminal", () => {
	const el = document.createElement("div");
	el.className = "doc-terminal";
	const out = document.createElement("pre");
	out.className = "stub-terminal-out";
	el.append(out);
	return {
		el,
		write: (d: unknown) => {
			out.textContent = String(d);
		},
		settle: () => el.classList.add("doc-terminal-settled"),
		dispose: () => el.remove(),
	};
});

interface Chat {
	openStreamingView(name: string, id: string, interactive?: boolean): { write(d: unknown): void; settle(): void } | null;
	liveView(id: string): { write(d: unknown): void; settle(): void } | null;
	getDocument(): string;
	beginTurn?: (at?: number) => void;
}

const PROMPT = "<!-- you -->\n\nrun the build\n";

test("a streaming view appears in the document and renders output incrementally", async () => {
	const { el } = await mount(PROMPT);
	const chat = el as unknown as Chat;

	const view = chat.openStreamingView("terminal", "call-1");
	assert.ok(view, "the terminal view is registered");
	await settle();

	// The marker is in the document — that is what a reload and a rebuild see.
	assert.match(chat.getDocument(), /<!-- pi:view terminal #call-1 -->/);
	// And it rendered as a panel, not as a visible fence.
	const panel = el.querySelector(".stub-terminal-out");
	assert.ok(panel, "the view mounted its panel");

	// Cumulative snapshots, exactly as pi's bash tool emits them.
	view.write("Compiling…\n");
	await settle();
	assert.equal(panel.textContent, "Compiling…\n");
	view.write("Compiling…\nLinking…\n");
	await settle();
	assert.equal(panel.textContent, "Compiling…\nLinking…\n", "later output replaces, it does not double");
	unmount(el);
});

test("writing output does not change the document's text", async () => {
	const { el } = await mount(PROMPT);
	const chat = el as unknown as Chat;
	const view = chat.openStreamingView("terminal", "call-2")!;
	await settle();
	const before = chat.getDocument();

	for (let i = 0; i < 20; i++) view.write(`line ${i}\n`);
	await settle();

	// Twenty chunks, zero document edits. This is live-views.ts rule 2 stated as a
	// test: a transaction per chunk would rebuild the widget and, on a real
	// terminal, throw the grid away.
	assert.equal(chat.getDocument(), before, "output is the view's, never the buffer's");
	unmount(el);
});

test("the same id adopts the open view instead of making a second one", async () => {
	const { el } = await mount(PROMPT);
	const chat = el as unknown as Chat;
	const first = chat.openStreamingView("terminal", "call-3");
	await settle();
	const again = chat.openStreamingView("terminal", "call-3");
	assert.equal(again, first, "one view per id (live-views.ts rule 4)");
	// And exactly one marker, so a second update cannot write a second panel.
	const markers = chat.getDocument().match(/<!-- pi:view terminal #call-3 -->/g) ?? [];
	assert.equal(markers.length, 1);
	assert.equal(el.querySelectorAll(".stub-terminal-out").length, 1);
	unmount(el);
});

test("settling marks the panel done but keeps its output readable", async () => {
	const { el } = await mount(PROMPT);
	const chat = el as unknown as Chat;
	const view = chat.openStreamingView("terminal", "call-4")!;
	view.write("done building\n");
	await settle();

	view.settle();
	await settle();
	const panel = el.querySelector(".doc-terminal");
	assert.ok(panel!.classList.contains("doc-terminal-settled"), "the panel says the command ended");
	// The output a reader was watching must not vanish when the command finishes.
	assert.match(el.querySelector(".stub-terminal-out")!.textContent ?? "", /done building/);
	unmount(el);
});

test("opening a view appends — it must never replace the document", async () => {
	// The bug this guards: `openStreamingView` used the STREAMING path, which replaces
	// `[msgAnchor, tailAnchor]`. Those are only a region while a turn is live, and a
	// user-opened terminal is never inside one — so the insert spanned the whole buffer
	// and wiped the conversation. In the browser 7619 characters became 40.
	const prose = `${PROMPT}\n${"a paragraph of the user's own writing.\n\n".repeat(20)}`;
	const { el } = await mount(prose);
	const chat = el as unknown as Chat;
	const before = chat.getDocument();
	assert.ok(before.length > 500, "the fixture really is a document worth losing");

	chat.openStreamingView("terminal", "keep-1");
	await settle();

	const after = chat.getDocument();
	// Everything that was there is still there, and the marker is additional.
	assert.ok(after.includes("a paragraph of the user's own writing."), "the prose survived");
	assert.ok(after.length > before.length, "the marker was added, not swapped in");
	assert.match(after, /<!-- pi:view terminal #keep-1 -->/);
	unmount(el);
});

test("an unregistered live name opens nothing, and writes no marker", async () => {
	const { el } = await mount(PROMPT);
	const chat = el as unknown as Chat;
	const before = chat.getDocument();
	assert.equal(chat.openStreamingView("no-such-live-view", "call-5"), null);
	await settle();
	// The document must not grow a marker for a view that cannot render — that
	// would leave an empty fence in the buffer forever.
	assert.equal(chat.getDocument(), before);
	unmount(el);
});

test("a terminal the user opens leaves a prompt under it, and what is typed next goes into that prompt", async () => {
	const { el, view } = await mount("<!-- you -->\n\nWhat is 2+2?\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\n");
	const chat = el as unknown as Chat;
	view.dispatch({ selection: { anchor: view.state.doc.length } });

	assert.ok(chat.openStreamingView("terminal", "term-1", true), "the terminal view is registered");
	await settle();

	// Relative to the panel's marker: the document goes on to a prompt of the
	// writer's, however the whitespace between them is tuned.
	const opened = chat.getDocument();
	const after = opened.slice(opened.indexOf("<!-- pi:view terminal #term-1 -->"));
	assert.match(after, /```\s*<!-- you -->\s*$/, "the page still ends in a prompt slot");
	assert.equal(view.state.selection.main.head, view.state.doc.length, "and the caret is in it");

	// The first character belongs to that prompt, like the ones after it.
	view.dispatch({ ...view.state.replaceSelection("/"), userEvent: "input.type" });
	view.dispatch({ ...view.state.replaceSelection("mod"), userEvent: "input.type" });
	const typed = chat.getDocument();
	assert.match(typed.slice(typed.lastIndexOf("<!-- you -->")), /^<!-- you -->\s*\/mod$/, "nothing is stranded above the prompt");
	unmount(el);
});
