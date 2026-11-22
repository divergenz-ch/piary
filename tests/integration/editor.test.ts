// The view layer, headless — run `pnpm build` first.
//
// Every bug this file guards against was once a bug report, because until now
// nothing below `parseDocument` was testable without a browser. The rule for
// geometry assertions: express them as a line's index RELATIVE TO ITS MARKER,
// never as an absolute newline count, so tuning whitespace cannot rot them.
import test from "node:test";
import assert from "node:assert/strict";
import { mount, onVirtualClock, settle, unmount } from "../helpers/editor.ts";

import { BLOCK_MARKER, blockKeyOf, blocksFrom, deleteBlockText, emptyDocument, parseDocument } from "../../dist/document/format.js";
import { deleteSegment, insertCellAt, tailPrompt } from "../../dist/document/run.js";
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { cellsFrom } from "../../dist/document/cells.js";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { CaretBlock, CellFailure, DocumentChat } from "../../dist/components/DocumentChat.js";
import type { ArtifactMember, PiArtifact } from "../../dist/components/ArtifactBlock.js";
import type { CellEditor } from "../../dist/components/CellEditor.js";

// Every test here runs on the virtual clock (helpers/editor.ts): its waits are
// the component's debounces and frames, and waiting them out in real time was
// most of what this file cost. `settle(ms)` advances the clock by `ms`.
onVirtualClock();

const BASE = emptyDocument("x");

/** An assistant message carrying only what the view reads off one: its content.
 *  `serializeAssistant` touches `content` and nothing else, and a mid-stream
 *  partial has no usage or stop reason yet — so the provider bookkeeping is
 *  filled in here once rather than restated at every call. */
const assistant = (content: AssistantMessage["content"]): AssistantMessage => ({
	role: "assistant",
	content,
	api: "",
	provider: "",
	model: "",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "stop",
	timestamp: 0,
});

/** One rendered line, as this file reads it. `.cm-line` always has text content
 *  (an empty line is ""), so the default at the boundary is the honest shape. */
interface Row {
	text: string;
	cls: Set<string>;
}

/** Rendered lines as [text, classSet] — the view's actual output. */
const lines = (el: Element): Row[] =>
	[...el.querySelectorAll(".cm-line")].map((l) => ({
		text: l.textContent ?? "",
		cls: new Set(l.className.split(/\s+/).filter((c) => c && c !== "cm-line")),
	}));

/** The `segment-menu` event's detail, as this file reads it: the offset of the
 *  segment the ⋯ hangs in, plus where to put the menu. */
interface SegmentMenu {
	from: number;
	x: number;
	y: number;
}

/** One rendered element the assertion depends on. The lookup failing is itself
 *  a regression, so it fails by name rather than on the next property read. */
function must<T extends Element = HTMLElement>(root: Element, selector: string): T {
	const found = root.querySelector<T>(selector);
	assert.ok(found, `nothing rendered for ${selector}`);
	return found;
}

/** The lines a cell occupies: its marker line and everything up to the next
 *  marker. Keyed by the rendered role label, which is what a reader sees. */
function cell(el: Element, label: string): Row[] {
	const all = lines(el);
	// The handle contributes no text (it is an SVG), so a line reads as its label.
	const start = all.findIndex((l) => l.text.startsWith(label));
	assert.notEqual(start, -1, `no cell labelled ${label} in:\n${all.map((l) => JSON.stringify(l.text)).join("\n")}`);
	let end = start + 1;
	while (end < all.length && !all[end].cls.has("doc-line-marker")) end++;
	return all.slice(start, end);
}

/** Which line indices (relative to the marker) carry `cls`. */
const carrying = (rows: readonly Row[], cls: string): number[] => rows.flatMap((row, i) => (row.cls.has(cls) ? [i] : []));

/** Type text at `pos` the way a keystroke does — userEvent drives the repair. */
async function type(view: EditorView, pos: number, text: string) {
	view.dispatch({ selection: { anchor: pos } });
	view.dispatch({
		changes: { from: pos, insert: text },
		selection: { anchor: pos + text.length },
		userEvent: "input.type",
	});
	await settle();
}

// A page with an empty markdown cell above the trailing prompt slot — what the
// `+` gutter and `/markdown` both produce.
const withNote = (() => {
	const at = BASE.indexOf("<!-- you -->");
	const s = insertCellAt(BASE, at, "markdown");
	return { md: BASE.slice(0, s.from) + s.insert + BASE.slice(s.to), caret: s.caret };
})();

// An empty cell rests its caret on the second body line: marker, collapsed
// blank, then the line you write on. Everything below that is separation from
// whatever comes next, which the trailing slot (nothing comes next) lacks — so
// the shared invariant is about the head of a cell, not its total height.
const CARET_ROW = 2;
const headOf = (rows: readonly Row[]): Row[] => rows.slice(0, CARET_ROW + 1);

test("an empty markdown cell and the trailing prompt slot have the same shape", async () => {
	const { el } = await mount(withNote.md);
	const note = headOf(cell(el, "markdown"));
	const slot = headOf(cell(el, "you"));
	assert.deepEqual(
		carrying(note, "doc-line-blank"),
		carrying(slot, "doc-line-blank"),
		"the collapsed line must sit at the same offset from the marker",
	);
	assert.deepEqual(carrying(note, "doc-block"), carrying(slot, "doc-block"), "the rule must reach as far in both");
	unmount(el);
});

test("an empty cell's block rule already reaches the line the caret rests on", async () => {
	// "When cursor is blinking, the line of the block should be already there."
	const { el } = await mount(withNote.md);
	for (const label of ["markdown", "you"]) {
		const rows = headOf(cell(el, label));
		assert.deepEqual(carrying(rows, "doc-block"), [0, 1, 2], `${label}: the rule reaches the resting line`);
	}
	unmount(el);
});

test("typing the first character does not move anything", async () => {
	// "When I start to type in a block, the cursor jumps to the line one above."
	const { el, view } = await mount(withNote.md);
	const before = cell(el, "markdown");
	await type(view, withNote.caret, "Q");
	const after = cell(el, "markdown");
	assert.equal(after.length, before.length, "the cell must not change height on the first keystroke");
	assert.deepEqual(carrying(after, "doc-line-blank"), carrying(before, "doc-line-blank"));
	assert.deepEqual(carrying(after, "doc-block"), carrying(before, "doc-block"));
	assert.equal(after[CARET_ROW].text, "Q", "the character lands on the line the caret was resting on");
	unmount(el);
});

test("a trailing space does not change the rendered line count", async () => {
	// "When I create a markdown block and type and add a space, it automatically
	//  jumps to the next line." — a block widget anchored at a computed line END
	//  splits the line the trim lands inside.
	const { el, view } = await mount(withNote.md);
	await type(view, withNote.caret, "Q3 revenue");
	const before = lines(el).length;
	await type(view, view.state.doc.toString().indexOf("Q3 revenue") + 10, " ");
	assert.equal(lines(el).length, before, "a trailing space must not add a rendered line");
	unmount(el);
});

test("typing in a block's last cell does not grow its rule", async () => {
	const { el, view } = await mount(withNote.md);
	const before = carrying(cell(el, "markdown"), "doc-block");
	await type(view, withNote.caret, "one");
	assert.deepEqual(carrying(cell(el, "markdown"), "doc-block"), before);
	unmount(el);
});

test("inserting a cell puts the caret where the trailing slot puts it", async () => {
	const { el, view } = await mount(withNote.md);
	const doc = view.state.doc;
	const markerLine = doc.lineAt(withNote.md.indexOf("<!-- pi:note -->")).number;
	const caretLine = doc.lineAt(withNote.caret).number;
	// The slot's own caret rests two lines below its marker: label, collapsed
	// blank, then the line you write on.
	const slotMarker = doc.lineAt(withNote.md.lastIndexOf("<!-- you -->")).number;
	assert.equal(caretLine - markerLine, 2);
	assert.equal(doc.lines - slotMarker, 2);
	unmount(el);
});

test("an empty cell offers its grip; the page's trailing prompt has none", async () => {
	const { el } = await mount(withNote.md);
	const at = (marker: string) => String(withNote.md.lastIndexOf(marker));
	const grips = [...el.querySelectorAll<HTMLElement>(".doc-cell-handle")].map((grip) => grip.dataset.at);
	assert.ok(grips.includes(at("<!-- pi:note -->")), "an empty note is a cell to move, and to open a menu on");
	// The slot is where you type next and never moves (`moveCell`), so a grip on
	// it offered a drag that could only be refused.
	assert.ok(!grips.includes(at("<!-- you -->")), "the trailing empty prompt carries no grip");
	unmount(el);
});

test("a brand-new page offers the insert gutter before anything is typed", async () => {
	const { el } = await mount(BASE);
	// Two, not "more than zero": a fresh page has a gap above its prompt and one
	// below it, and a `> 0` here would survive losing either (§4).
	assert.equal(el.querySelectorAll(".doc-cell-gap").length, 2, "a new page offers a `+` above and below");
	unmount(el);
});

test("backspace at the top of a body cannot dissolve the marker above it", async () => {
	const { el, view } = await mount(withNote.md);
	const body = withNote.md.indexOf("<!-- pi:note -->") + "<!-- pi:note -->".length + 1;
	const before = view.state.doc.toString();
	view.dispatch({ selection: { anchor: body } });
	view.dispatch({ changes: { from: body - 1, to: body }, userEvent: "delete.backward" });
	await settle();
	assert.equal(view.state.doc.toString(), before, "the newline ending a marker line is structural");
	unmount(el);
});

// The same keystroke one press later, with somewhere to go. The filter above
// stays exactly as it is — this is a gesture on top of it, which is why both
// tests can be true at once.
const emptyBlockPage = `${BASE}`.replace(
	"<!-- you -->\n\n",
	"<!-- you -->\n\nchart it\n\n<!-- pi -->\n\nhere you go\n\n<!-- pi:note -->\n\n\n\n<!-- you -->\n\n",
);

test("backspace in an empty block takes the block out", async () => {
	// "When pressing backspace in an empty block until the cursor reaches the
	//  headline of the block, it gets stuck there."
	const { el, view } = await mount(emptyBlockPage);
	const body = emptyBlockPage.indexOf("<!-- pi:note -->") + "<!-- pi:note -->".length + 1;
	view.dispatch({ selection: { anchor: body + 1 } }); // where the caret rests: one line below the head
	assert.equal(el.backspaceAtBlockHead(), true, "the press is answered");
	await settle();
	const md = view.state.doc.toString();
	assert.ok(!md.includes("pi:note"), "the empty block is gone");
	assert.ok(md.includes("here you go"), "and the block above it is not");
	assert.equal(md.slice(view.state.selection.main.head - 11, view.state.selection.main.head), "here you go");
	assert.match(md, /<!-- you -->\s*$/, "the page still ends in a prompt slot");
	unmount(el);
});

test("Backspace is bound: the keystroke reaches the gesture", async () => {
	const { el, view } = await mount(emptyBlockPage);
	const body = emptyBlockPage.indexOf("<!-- pi:note -->") + "<!-- pi:note -->".length + 1;
	view.dispatch({ selection: { anchor: body + 1 } });
	view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", keyCode: 8, bubbles: true }));
	await settle();
	assert.ok(!view.state.doc.toString().includes("pi:note"), "the binding sits ahead of deleteCharBackward");
	unmount(el);
});

test("undo takes the block back in one step", async () => {
	const { el, view } = await mount(emptyBlockPage);
	const body = emptyBlockPage.indexOf("<!-- pi:note -->") + "<!-- pi:note -->".length + 1;
	view.dispatch({ selection: { anchor: body + 1 } });
	el.backspaceAtBlockHead();
	await settle();
	undo(view);
	await settle();
	assert.ok(view.state.doc.toString().includes("pi:note"), "one \u2318Z, the whole block back");
	unmount(el);
});

test("a block with a headline in it survives the same press", async () => {
	const page = emptyBlockPage.replace("<!-- pi:note -->\n\n\n", "<!-- pi:note -->\n\n# Headline\n");
	const { el, view } = await mount(page);
	const body = page.indexOf("<!-- pi:note -->") + "<!-- pi:note -->".length + 1;
	view.dispatch({ selection: { anchor: body } });
	assert.equal(el.backspaceAtBlockHead(), false, "declined, so ordinary Backspace runs");
	await settle();
	assert.ok(view.state.doc.toString().includes("# Headline"), "one press can never swallow text");
	unmount(el);
});

test("mid-stream the gesture is answered on a block above the run", async () => {
	// It goes through `edit`, which annotates `ownEdit` — exactly what the
	// streaming filter waves through — so this used to be refused for the whole
	// length of a turn, wherever the caret was. `edit` checks the change against
	// the machine's region itself now, so a block that has nothing to do with the
	// reply takes the press.
	const { el, view } = await mount(emptyBlockPage);
	el.streaming = true;
	el.beginTurn();
	await settle();
	const md = view.state.doc.toString();
	const body = md.indexOf("<!-- pi:note -->") + "<!-- pi:note -->".length + 1;
	view.dispatch({ selection: { anchor: body + 1 } });
	assert.equal(el.backspaceAtBlockHead(), true, "the press is answered");
	await settle();
	assert.ok(!view.state.doc.toString().includes("pi:note"), "the block above the run goes");
	el.streaming = false;
	unmount(el);
});

test("mid-stream a structural splice over the machine's region is refused", async () => {
	// The other half of the same guard, and the one that was missing entirely:
	// the block menu could delete the segment under the write head mid-run,
	// because `ownEdit` carried it straight past the filter.
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	el.applyAssistantPartial(assistant([{ type: "text", text: "half an ans" }]));
	await settle();
	const before = view.state.doc.toString();
	const { msgAnchor, tailAnchor } = el.region;
	el.edit(() => ({ changes: { from: msgAnchor, to: tailAnchor, insert: "gone" } }));
	await settle();
	assert.equal(view.state.doc.toString(), before, "nothing splices what the machine is writing");
	el.streaming = false;
	unmount(el);
});

test("mid-stream a gesture and a keystroke draw the writer's page in the same place", async () => {
	// Two consumers ask `machineSpan` the same question — the keystroke filter and
	// `edit`, for gestures annotated `ownEdit` that never reach that filter. If
	// they answered differently at the edges, the page would be one shape to type
	// in and another to act on, which is the "sometimes it works" class of bug.
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	await type(view, view.state.doc.length, "meanwhile");

	// Below the span: both let it through.
	const draft = view.state.doc.toString().indexOf("meanwhile");
	el.edit(() => ({ changes: { from: draft, insert: "well, " } }));
	await settle();
	assert.match(view.state.doc.toString(), /well, meanwhile$/, "a gesture in the draft lands");

	// Inside it: both refuse, and the keystroke that would have gone to the same
	// offset is refused too.
	const before = view.state.doc.toString();
	const { tailAnchor } = el.region;
	el.edit(() => ({ changes: { from: tailAnchor + 2, to: tailAnchor + 6, insert: "x" } }));
	await settle();
	await type(view, tailAnchor + 2, "x");
	assert.equal(view.state.doc.toString(), before, "the pending prompt marker is nobody's to rewrite");
	el.streaming = false;
	unmount(el);
});

test("a selection that contains a whole cell still deletes it", async () => {
	const { el, view } = await mount(withNote.md);
	const from = withNote.md.indexOf("<!-- pi:note -->");
	const to = withNote.md.lastIndexOf("<!-- you -->");
	view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: "delete.selection" });
	await settle();
	assert.ok(!view.state.doc.toString().includes("pi:note"), "deleting a cell whole is an intentional gesture");
	unmount(el);
});

test("a user edit always leaves the page ending in a prompt slot", async () => {
	const { el, view } = await mount(withNote.md);
	// Delete the trailing slot outright; the invariant must put one back.
	const at = view.state.doc.toString().lastIndexOf("<!-- you -->");
	view.dispatch({ changes: { from: at, to: view.state.doc.length }, userEvent: "delete.selection" });
	await settle();
	assert.match(view.state.doc.toString(), /<!-- you -->\s*$/, "the tail is always a prompt slot");
	unmount(el);
});

test("a reply streams in above a draft the writer keeps typing", async () => {
	// The machine's region is two offsets into the document. They used to be
	// hand-maintained numbers on the component; now they ride doc changes, so a
	// draft growing below them cannot make the next splice land in the wrong
	// place.
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	await type(view, view.state.doc.length, "meanwhile");
	el.applyAssistantPartial(assistant([{ type: "text", text: "look at APAC" }]));
	await settle();
	assert.match(
		view.state.doc.toString(),
		/<!-- pi -->\n\nlook at APAC\n\n<!-- you -->\n\nmeanwhile$/,
		"the reply lands in the machine's region; the draft stays where it was written",
	);
	el.streaming = false;
	unmount(el);
});

test("only the step being written pulses — the finished ones above it are still", async () => {
	// The pulse used to hang off `.doc-role:not(.doc-role-you)`, so every machine
	// label in the file breathed at once for the length of a turn: at ten steps
	// the animation stopped meaning "this step, right here" and started meaning
	// "a run is going", which the bar already says. One label carries it now —
	// whichever widget stands for the last machine segment.
	/** Every rendered role label in document order; the live one is starred. */
	const labels = (el: Element) =>
		[...el.querySelectorAll(".doc-role")].map(
			(n) => `${(n.textContent ?? "").replace(/⋯$/, "")}${n.classList.contains("doc-role-live") ? "*" : ""}`,
		);
	const turn = [
		"<!-- you -->",
		"",
		"what now",
		"",
		"<!-- pi -->",
		"",
		"first, the ledger",
		"",
		"<!-- pi:tool bash #1 -->",
		"",
		"```json",
		'{"cmd":"ls"}',
		"```",
		"",
	].join("\n");
	const head = BASE.replace(/<!-- you -->\n\n$/, "");
	const answering = `${head}${turn}<!-- pi -->\n\nand now the answer\n\n<!-- you -->\n\n`;

	const { el } = await mount(answering);
	el.streaming = true;
	await settle();
	assert.deepEqual(labels(el), ["you", "agent", "bash", "agent*", "you"], "the reply being written, not the `agent` above the call");

	// The live step is just as often a folded one — tool calls fold by default,
	// and then the fold's label is what stands for it.
	const { el: el2 } = await mount(`${head}${turn}<!-- you -->\n\n`);
	el2.streaming = true;
	await settle();
	assert.deepEqual(labels(el2), ["you", "agent", "bash*", "you"], "the folded call is live; the `agent` above it is done");

	// Three steps in a row are one strip standing in for the last of them, so
	// the strip is what pulses — not the answer that opened the turn.
	const run = `${head}${turn}<!-- pi:result #1 -->\n\n\`\`\`\na.txt\n\`\`\`\n\n<!-- pi:thinking -->\n\nso it is there\n\n<!-- you -->\n\n`;
	const { el: el3 } = await mount(run);
	el3.streaming = true;
	await settle();
	assert.deepEqual(labels(el3), ["you", "agent", "3 steps*", "you"], "the activity strip pulses for the step it covers");

	// A prompt just sent: the empty `<!-- pi -->` the send opens is the live
	// step from the first frame — the PREVIOUS turn's tail never stands in.
	const { el: el4 } = await mount(`${answering.trimEnd()}\nask again\n`);
	el4.streaming = true;
	el4.beginTurn();
	await settle();
	assert.deepEqual(labels(el4), ["you", "agent", "bash", "agent", "you", "agent*", "you"], "the region the send just opened");

	for (const e of [el, el2, el3, el4]) {
		e.streaming = false;
		unmount(e);
	}
});

test("mid-stream the page stays writable — except where the machine is writing", async () => {
	// This used to freeze from offset 0, so a turn took the document away: no
	// fixing a word in a markdown block, no editing the prompt you had just sent,
	// nothing but the draft slot at the bottom. Only the span being spliced is
	// the machine's.
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	el.applyAssistantPartial(assistant([{ type: "text", text: "look at APAC" }]));
	await settle();

	const at = view.state.doc.toString().indexOf("what now");
	await type(view, at, "so, ");
	assert.match(view.state.doc.toString(), /so, what now/, "the prompt that is running is still the writer's");

	const before = view.state.doc.toString();
	const { msgAnchor, tailAnchor } = el.region;
	view.dispatch({ changes: { from: msgAnchor + 2, to: tailAnchor - 2 }, userEvent: "delete.selection" });
	await settle();
	assert.equal(view.state.doc.toString(), before, "the reply being written is not");

	// The caret may go anywhere — that used to die with the transaction.
	view.dispatch({ selection: { anchor: msgAnchor + 3 } });
	assert.equal(view.state.selection.main.head, msgAnchor + 3);
	el.streaming = false;
	unmount(el);
});

test("a character typed at the region's first offset does not vanish into it", async () => {
	// `ChangeSet.filter` lets a zero-length change starting EXACTLY at a range's
	// first offset through, and `msgAnchor` maps with assoc -1 — so without the
	// filter's `- 1` this insertion landed inside the splice target and the next
	// chunk erased it. Text a writer typed and watched disappear.
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	const { msgAnchor } = el.region;
	await type(view, msgAnchor, "X");
	// Refused outright is the whole point: unfiltered, the character appears HERE
	// and disappears one chunk later, which is worse than never taking it.
	assert.ok(!view.state.doc.toString().includes("X"), "the keystroke never lands");
	el.applyAssistantPartial(assistant([{ type: "text", text: "the answer" }]));
	await settle();
	assert.match(
		view.state.doc.toString(),
		/<!-- pi -->\n\nthe answer\n\n<!-- you -->/,
		"and the reply lands whole",
	);
	el.streaming = false;
	unmount(el);
});

test("a reply streams in above a draft and below an edit made while it ran", async () => {
	// The mapping half of the feature: text inserted above the region moves both
	// anchors, so the next splice still lands on the machine's own text and the
	// edit survives the turn.
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	await type(view, view.state.doc.length, "meanwhile");
	const at = view.state.doc.toString().indexOf("what now");
	await type(view, at, "hey — ");
	el.applyAssistantPartial(assistant([{ type: "text", text: "look at APAC" }]));
	await settle();
	assert.match(
		view.state.doc.toString(),
		/hey — what now\n\n<!-- pi -->\n\nlook at APAC\n\n<!-- you -->\n\nmeanwhile$/,
		"the edit above, the reply in its region, the draft below — all three intact",
	);
	el.streaming = false;
	unmount(el);
});

test("an edit above the region marks the turn's history as unsent", async () => {
	// The host slices the document at `msgAnchor` to record what the transcript
	// has seen. Text the writer put up there during the turn has never been sent,
	// so the slice would claim it as history and the next send would skip the
	// rebuild that carries it. This flag is how the host learns to drop the claim.
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	assert.equal(el.isHeadEdited, false, "a turn opens with nothing owed");

	await type(view, view.state.doc.length, "meanwhile");
	assert.equal(el.isHeadEdited, false, "the tail draft is below the region — already handled");

	const at = view.state.doc.toString().indexOf("what now");
	await type(view, at, "so, ");
	assert.equal(el.isHeadEdited, true, "text above the region is not in the transcript");
	el.streaming = false;
	unmount(el);
});

test("a cell the writer edits mid-run is not attributed to the machine", async () => {
	// The report gate used to ask only "is this cell above the write head?",
	// which was a sound proxy for "did the machine write it?" while nothing else
	// COULD write up there. Now the writer can, and a cell caught half-typed
	// would be reported to the agent as its own failure — the bogus-report storm
	// `reportSettledFailures` was written to close, through a new door.
	const page = `${BASE}`.replace(
		"<!-- you -->\n\n",
		["<!-- you -->", "", "mine", "", "<!-- pi:cell js #mine -->", "", "```js", "const n = 1", "```", "", "<!-- you -->", "", ""].join("\n"),
	);
	const { el, view } = await mount(page);
	await settle(600); // the cell sync is debounced, and loads the engine
	el.streaming = true;
	el.beginTurn();
	await settle();

	// Retype the writer's own cell, above where the turn opened.
	const at = view.state.doc.toString().indexOf("const n = 1");
	view.dispatch({ changes: { from: at, to: at + "const n = 1".length, insert: "const n = 2" }, userEvent: "input.type" });
	await settle(600);
	assert.ok(!el.turnCells.has("mine"), "the writer's cell stays the writer's");

	// …while a cell the machine writes into its own region still is its own.
	el.applyAssistantPartial(assistant([{ type: "toolCall", id: "theirs", name: "cell", arguments: { source: "const m = 3" } }]));
	await settle(600);
	assert.ok(el.turnCells.has("theirs"), "and the machine's cell is still reported for");
	el.streaming = false;
	unmount(el);
});

test("undo steps back out of an edit that created structure", async () => {
	const { el, view } = await mount(withNote.md);
	await type(view, withNote.caret, "Q3");
	const typed = view.state.doc.toString();
	const { undo } = await import("@codemirror/commands");
	undo(view);
	await settle();
	assert.notEqual(view.state.doc.toString(), typed, "⌘Z must not be vetoed by the structure filter");
	unmount(el);
});

test("Enter opens a line you can see, inside the rule — whatever the cell is", async () => {
	// A blank line the serializer writes is not composition; a blank line you
	// just opened with Enter is. Collapsing the second one hid the caret in a
	// 6px sliver and stopped the block rule a line short of it.
	for (const [label, seed] of [
		["markdown", withNote.md],
		["you", withNote.md],
	]) {
		const { el, view } = await mount(seed);
		// Write into the cell under test, then open a line at the end of it.
		const marker = label === "markdown" ? seed.indexOf("<!-- pi:note -->") : seed.lastIndexOf("<!-- you -->");
		const start = label === "markdown" ? withNote.caret : view.state.doc.length;
		await type(view, start, "some text");
		const at = view.state.doc.toString().indexOf("some text") + 9;
		await type(view, at, "\n");
		const rows = cell(el, label);
		const caretRow =
			view.state.doc.lineAt(view.state.selection.main.head).number -
			view.state.doc.lineAt(view.state.doc.toString().indexOf(seed.slice(marker, marker + 12))).number;
		assert.ok(!rows[caretRow].cls.has("doc-line-blank"), `${label}: the line the caret opened keeps its height`);
		assert.ok(rows[caretRow].cls.has("doc-block"), `${label}: and the block rule reaches it`);
		unmount(el);
	}
});

test("a paragraph break inside prose stays the writer's", async () => {
	const { el, view } = await mount(withNote.md);
	await type(view, withNote.caret, "one\n\ntwo");
	const rows = cell(el, "markdown");
	const blank = rows.findIndex((r) => r.text === "" && r.cls.has("doc-line-note"));
	const bodyBlanks = rows.filter((r, i) => i > 0 && r.text === "" && !r.cls.has("doc-line-blank"));
	assert.ok(bodyBlanks.length >= 1, "the blank between two paragraphs keeps full height");
	assert.ok(blank >= 0);
	unmount(el);
});

test("a programmatic insert at the end still leaves a prompt slot", async () => {
	// `+ ▸ JavaScript` on the last gap puts a cell past the tail. The page then
	// had nowhere to write and nothing to send until the next keystroke put the
	// slot back — the invariant was skipping host edits along with the machine's.
	const { el, view } = await mount(BASE);
	el.edit((md) => ({ changes: { from: md.length, insert: "<!-- pi:note -->\n\n" }, caret: md.length + 18 }));
	await settle();
	assert.match(view.state.doc.toString(), /<!-- you -->\s*$/, "a cell appended past the tail opens a new slot");
	unmount(el);
});

// ---------- the artifact frame and its nested source editors ----------
//
// The code pane is a CodeMirror inside a CodeMirror, which is the one place in
// this component where two editors could disagree about what the text is.
// These pin that they cannot: every edit goes to the document, and the document
// is what comes back.

/** Unfold the artifact's source and wait for its editors to build. Clicking the
 *  role label is the only affordance — the same one every other foldable block
 *  in the document uses. */
const openCode = async (el: DocumentChat): Promise<PiArtifact> => {
	const frame = el.querySelector<PiArtifact>("pi-artifact");
	assert.ok(frame, "the document rendered an artifact frame");
	const role = frame.querySelector<HTMLElement>(".artifact-source-head .doc-role");
	assert.ok(role, "the frame has the role label that unfolds it");
	role.click();
	await settle(80);
	return frame;
};

/** A member's code pane. Both steps are invariants the caller is asserting on:
 *  the member is in the frame, and its source has been unfolded (which is what
 *  builds the editor). */
const paneOf = (frame: PiArtifact, id: string): EditorView => {
	const member = frame.members.find((m) => m.id === id);
	assert.ok(member, `the frame carries a member #${id}`);
	assert.ok(member.editor, `#${id}'s source is unfolded, so it has an editor`);
	return member.editor.view;
};

const ARTIFACT_DOC = [
	"draw me something",
	"",
	"<!-- pi -->",
	"",
	"here it is",
	"",
	"<!-- pi:artifact @demo -->",
	"",
	"<!-- pi:cell js #aa -->",
	"",
	"```js",
	"const n = 1",
	"```",
	"",
	"<!-- pi:cell js #bb -->",
	"",
	"```js",
	"n + 1",
	"```",
	"",
	"<!-- pi -->",
	"",
	"that is the answer",
	"",
	"<!-- you -->",
	"",
	"",
].join("\n");

test("a run of cells renders as one artifact under the answer", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600); // the cell sync is debounced 300ms, and loads the engine
	const frames = el.querySelectorAll<PiArtifact>("pi-artifact");
	assert.equal(frames.length, 1, "two cells in one artifact block, one frame");
	assert.equal(frames[0].members.length, 2);
	// The fences are gone from the flow — the frame is where the source lives.
	const rendered = [...el.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n");
	assert.ok(!rendered.includes("const n = 1"), "the member fence is hidden");
	assert.ok(rendered.includes("that is the answer"), "the answer is not");
	// …but it is still in the document, which is the store.
	assert.ok(view.state.doc.toString().includes("const n = 1"));
	unmount(el);
});

test("typing in the code pane writes through to that cell's fence", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600); // the cell sync is debounced 300ms, and loads the engine
	const frame = await openCode(el);
	const member = frame.members.find((m) => m.id === "aa");
	assert.ok(member, "the frame carries the member");
	assert.ok(member.editor, "the pane built an editor for the cell");
	const inner = member.editor.view;
	inner.dispatch({ changes: { from: inner.state.doc.length, to: inner.state.doc.length, insert: "1" } });
	await settle(400); // the cell sync is debounced
	const md = view.state.doc.toString();
	assert.ok(md.includes("const n = 11"), "the edit landed in the fence");
	assert.equal((md.match(/<!-- pi:cell js #aa -->/g) ?? []).length, 1, "and left the marker alone");
	assert.ok(md.includes("n + 1"), "and the other cell alone");
	unmount(el);
});

test("undo is the document's: it reverts a pane edit and the pane follows", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600); // the cell sync is debounced 300ms, and loads the engine
	const frame = await openCode(el);
	const inner = paneOf(frame, "aa");
	const before = view.state.doc.toString();
	inner.dispatch({ changes: { from: inner.state.doc.length, to: inner.state.doc.length, insert: "1" } });
	await settle(400);
	assert.notEqual(view.state.doc.toString(), before);
	undo(view);
	await settle(400);
	assert.equal(view.state.doc.toString(), before, "the document is back");
	assert.equal(inner.state.doc.toString(), "const n = 1", "and so is the editor showing it");
	unmount(el);
});

test("the agent redefining a cell reaches an open code pane", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600); // the cell sync is debounced 300ms, and loads the engine
	const frame = await openCode(el);
	const inner = paneOf(frame, "aa");
	// A redefinition arrives as a later block with the same id — what the `cell`
	// tool writes when the agent edits its own cell.
	const md = view.state.doc.toString();
	const at = md.indexOf("<!-- pi -->\n\nthat is the answer");
	view.dispatch({ changes: { from: at, to: at, insert: "<!-- pi:cell js #aa -->\n\n```js\nconst n = 99\n```\n\n" } });
	await settle(400);
	assert.equal(inner.state.doc.toString(), "const n = 99", "the pane shows the winning definition");
	assert.equal(el.querySelectorAll<PiArtifact>("pi-artifact").length, 1, "and it is still one artifact");
	unmount(el);
});

// ---------- edit mode: the buffer, and the two ways out of it ----------
//
// A pane used to write every keystroke through to the document, so half-typed
// source reached the reactive graph on a 300ms timer. These pin that it no
// longer does, and that both ways out land where they say they do.

/** Click the `✎ edit` affordance. Only on an open pane — you read the source,
 *  then you decide to change it. */
const beginEdit = async (frame: PiArtifact) => {
	const edit = frame.querySelector<HTMLElement>(".artifact-edit");
	assert.ok(edit, "the open pane offers the edit affordance");
	edit.click();
	await settle(40);
};

/** Type into a pane. `editable` gates the DOM, not dispatch, so this is what a
 *  user's typing amounts to once it is past the contenteditable. */
const typeInPane = async (inner: EditorView, text: string) => {
	inner.dispatch({ changes: { from: inner.state.doc.length, to: inner.state.doc.length, insert: text } });
	await settle(40);
};

/** The document's own reading of a cell's source — what the fence actually
 *  holds, parsed the way everything else parses it. */
const fenceSource = (view: EditorView, id: string) => {
	const md = view.state.doc.toString();
	return cellsFrom(md, parseDocument(md).segments)
		.filter((c) => c.id === id)
		.at(-1)?.source;
};

test("an idle pane is for reading: it is not editable until you say so", async () => {
	const { el } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	const inner = paneOf(frame, "aa");
	assert.equal(inner.state.facet(EditorView.editable), false, "the pane starts read-only");
	await beginEdit(frame);
	assert.equal(inner.state.facet(EditorView.editable), true, "edit mode makes it writable");
	assert.equal(frame.editing, true);
	unmount(el);
});

test("in edit mode the keystrokes are buffered — the document does not move", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	await beginEdit(frame);
	const before = view.state.doc.toString();
	const inner = paneOf(frame, "aa");
	await typeInPane(inner, "1");
	await settle(500); // well past the 300ms sync the old write-through rode
	assert.equal(view.state.doc.toString(), before, "nothing reached the document");
	assert.equal(inner.state.doc.toString(), "const n = 11", "and the pane holds the buffer");
	assert.ok(frame.dirty.has("aa"), "the member is marked dirty");
	assert.ok(!frame.dirty.has("bb"), "and the one nobody touched is not");
	unmount(el);
});

test("Apply writes every changed member in ONE transaction", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	await beginEdit(frame);
	const before = view.state.doc.toString();
	await typeInPane(paneOf(frame, "aa"), "1");
	await typeInPane(paneOf(frame, "bb"), "1");
	must(frame, ".artifact-apply").click();
	await settle(500);
	assert.equal(fenceSource(view, "aa"), "const n = 11", "the first member landed");
	assert.equal(fenceSource(view, "bb"), "n + 11", "so did the second");
	assert.equal(frame.editing, false, "and the mode is over");
	// One graph, one commit, one step back out of it.
	undo(view);
	await settle(500);
	assert.equal(view.state.doc.toString(), before, "a single undo takes back the whole Apply");
	unmount(el);
});

test("Apply is refused while nothing has changed", async () => {
	const { el } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	await beginEdit(frame);
	assert.equal(must<HTMLButtonElement>(frame, ".artifact-apply").disabled, true, "there is no empty commit");
	unmount(el);
});

test("Discard drops the buffer and leaves the document untouched", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	await beginEdit(frame);
	const before = view.state.doc.toString();
	const inner = paneOf(frame, "aa");
	await typeInPane(inner, "999");
	must(frame, ".artifact-discard").click();
	await settle(400);
	assert.equal(inner.state.doc.toString(), "const n = 1", "the pane is back to the document's text");
	assert.equal(view.state.doc.toString(), before, "which never changed");
	assert.equal(frame.editing, false);
	assert.equal(frame.dirty.size, 0);
	unmount(el);
});

test("undo inside a buffered pane undoes the buffer, not the document", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	await beginEdit(frame);
	const before = view.state.doc.toString();
	const inner = paneOf(frame, "aa");
	await typeInPane(inner, "1");
	// The pane grows a history of its own for exactly as long as its text is not
	// in the document — delegating outward here would undo something else.
	assert.equal(undo(inner), true, "the pane has a history while editing");
	await settle(40);
	assert.equal(inner.state.doc.toString(), "const n = 1", "the buffer stepped back");
	assert.equal(view.state.doc.toString(), before, "and the document never moved");
	unmount(el);
});

test("the agent redefining a cell mid-edit does not overwrite the buffer", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	await beginEdit(frame);
	const inner = paneOf(frame, "aa");
	await typeInPane(inner, " // mine");
	const md = view.state.doc.toString();
	const at = md.indexOf("<!-- pi -->\n\nthat is the answer");
	view.dispatch({ changes: { from: at, to: at, insert: "<!-- pi:cell js #aa -->\n\n```js\nconst n = 99\n```\n\n" } });
	await settle(500);
	// Only one of these two can be recovered afterwards, and it is not the buffer.
	assert.equal(inner.state.doc.toString(), "const n = 1 // mine", "the unsaved edit survives");
	assert.equal(fenceSource(view, "aa"), "const n = 99", "the document keeps the agent's");
	unmount(el);
});

// ---------- what broke the artifact, and could not be undone ----------

test("a cell whose source carries a fence survives the round trip", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	await beginEdit(frame);
	const inner = paneOf(frame, "aa");
	// A line that is exactly ``` closes a three-tick fence. Splicing it into the
	// CONTENT range — which is all a write-back used to do — truncated the cell
	// or unclosed it outright, and what came back was not the cell.
	const source = "const s = `\n```\n`;";
	inner.dispatch({ changes: { from: 0, to: inner.state.doc.length, insert: source } });
	await settle(40);
	must(frame, ".artifact-apply").click();
	await settle(600);
	assert.ok(view.state.doc.toString().includes("````js"), "the fence widened to hold it");
	assert.equal(fenceSource(view, "aa"), source, "and the source reads back exactly");
	unmount(el);
});

test("a fence unclosed mid-edit keeps its cell, its element and its editor", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	assert.ok(el.cellEditors.get("aa"), "the pane built an editor");
	// Take one backtick off #aa's closing fence: `cellSource` returns null and
	// the cell vanishes from the parse — the state a fence is in between the
	// first and third keystroke of typing one.
	const md = view.state.doc.toString();
	const close = md.indexOf("```", md.indexOf("const n = 1"));
	view.dispatch({ changes: { from: close, to: close + 1, insert: "" } });
	await settle(600);
	assert.equal(fenceSource(view, "aa"), undefined, "the cell really is unparseable");
	// Retracting here took the running cell, its element AND the editor being
	// typed in — after which the pane rendered the pending placeholder for good.
	assert.ok(el.cellEls.get("aa"), "the element is still standing");
	assert.ok(el.cellEditors.get("aa"), "and so is the editor");
	// Put it back: the cell returns to the frame with the editor it kept.
	view.dispatch({ changes: { from: close, to: close, insert: "`" } });
	await settle(600);
	assert.ok(
		frame.members.find((m) => m.id === "aa")?.editor,
		"the member came back editable",
	);
	unmount(el);
});

test("a cell added to an artifact whose pane is ALREADY open gets an editor", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const frame = await openCode(el);
	assert.equal(frame.members.length, 2);
	// The agent adds a cell to an artifact the reader already has open. The build
	// used to fire on the closed→open edge alone, so this one never got an editor
	// and rendered `…` until the artifact was folded and unfolded.
	const md = view.state.doc.toString();
	const at = md.indexOf("<!-- pi -->\n\nthat is the answer");
	view.dispatch({ changes: { from: at, to: at, insert: "<!-- pi:cell js #cc -->\n\n```js\nn + 2\n```\n\n" } });
	await settle(700);
	assert.equal(frame.members.length, 3, "the artifact gathered it");
	assert.ok(
		frame.members.every((m) => m.editor),
		"every member has an editor",
	);
	assert.equal(frame.querySelectorAll(".artifact-code-pending").length, 0, "and nothing is left pending");
	unmount(el);
});

// ---------- a cell that does not compile has to reach the agent ----------
//
// The failure this pins cost a whole session: the model wrote a React
// component into a `js` cell, the compile failed before the runtime ever saw
// it, so the engine's observer never fired, no report was steered, and the
// agent answered "Done!" over a red box.

/** The React component a model actually wrote into a `js` cell, twice. */
const JSX_SOURCE = 'const W = () => {\n  return (\n    <div className="x">hi</div>\n  );\n};';

/** Stream a `cell` tool call into the machine's region, the way a turn does —
 *  through the serializer, not as raw text (assistant prose gets its marker
 *  look-alikes escaped, and rightly so). `streaming` is load-bearing: it is
 *  what makes the spliced cell the TURN's rather than the writer's, which is
 *  the whole attribution question. */
const streamCell = async (el: DocumentChat, source: string, id = "rx") => {
	el.streaming = true;
	await settle();
	el.beginTurn();
	const msg = assistant([
			{ type: "text", text: "here it is" },
			{ type: "toolCall", id: `toolu_${id}`, name: "cell", arguments: { source, id } },
		]);
	el.applyAssistantPartial(msg);
	await settle(400);
	// Finalizing is what makes the source FINAL — until then the turn is still
	// writing it, and a compile failure is not yet anybody's news.
	el.finalizeAssistant(msg);
	await settle(600);
};

const JSX_CELL = `<!-- pi:cell js #rx -->\n\n\`\`\`js\n${JSX_SOURCE}\n\`\`\``;

test("a cell the turn authored that cannot compile reports to the host", async () => {
	const { el } = await mount(BASE);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	await streamCell(el, JSX_SOURCE);
	assert.equal(failures.length, 1, "the compile failure reached the host");
	assert.equal(failures[0].id, "rx");
	assert.match(failures[0].error, /Unexpected token|token/i, "with the compiler's message");
	unmount(el);
});

/** A negative `cell-failure` assertion, with its own control.
 *
 *  Each "no report fired" test below would pass with the dispatch deleted — four
 *  of them do, verified by mutation. The positives beside them are what keep the
 *  feature honest, but a negative read on its own proves nothing, so this pairs
 *  every one with a live-wire check: the same listener, on an input that MUST
 *  report, in the same mounted page. If the control does not fire, the test says
 *  the harness went deaf rather than that the gate held
 *  (docs/TEST_ARCHITECTURE.md §4).
 */
async function assertNoReportButWired(
	failures: CellFailure[],
	el: DocumentChat,
	why: string,
): Promise<void> {
	assert.deepEqual(failures, [], why);
	// The control: a turn authoring a cell that cannot compile always reports.
	// `streaming` is what engages the authorship gate — a turn is only "the
	// turn's" while one is running — so the control sets it regardless of what
	// the case under test left behind.
	el.streaming = true;
	await settle();
	el.beginTurn();
	await settle();
	const broken = assistant([
		{ type: "toolCall", id: "toolu_ctl", name: "cell", arguments: { source: "const <<< = 1", id: "ctl" } },
	]);
	el.applyAssistantPartial(broken);
	el.finalizeAssistant(broken);
	await settle(1600);
	el.streaming = false;
	assert.ok(failures.length > 0, "control: the listener is live and the gate does report");
}

test("a cell the WRITER broke is theirs to fix — nobody gets steered", async () => {
	// Same unparseable cell, but authored by hand rather than by a turn.
	const { el } = await mount(`ask\n\n${JSX_CELL}\n\n<!-- you -->\n\n`);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	await settle(1400);
	await assertNoReportButWired(failures, el, "no turn authored it, so no report");
	unmount(el);
});

test("a broken artifact opens its own source; a healthy one stays folded", async () => {
	const { el } = await mount(`ask\n\n${JSX_CELL}\n\n<!-- you -->\n\n`);
	await settle(600);
	const broken = el.querySelector<PiArtifact>("pi-artifact");
	assert.ok(broken, "the broken cell rendered an artifact frame");
	assert.equal(broken.open, true, "the evidence for a failure is not hidden behind a click");
	assert.ok(broken.querySelector(".artifact-code"), "and its source is actually rendered");
	unmount(el);

	const { el: ok } = await mount(ARTIFACT_DOC);
	await settle(600);
	const healthy = ok.querySelector<PiArtifact>("pi-artifact");
	assert.ok(healthy, "the working cells rendered an artifact frame");
	assert.equal(healthy.open, false, "a working artifact reads as its output");
	assert.equal(healthy.querySelector(".artifact-code"), null);
	assert.ok(healthy.querySelector(".artifact-source-head .doc-role"), "with the label saying where the code went");
	unmount(ok);
});

test("a cell still being streamed never reports its half-written source", async () => {
	// The regression this pins cost a whole session. `serializeAssistant` fences
	// a PARTIAL `source` argument as if it were whole, so mid-stream the document
	// holds a closed fence around half a string literal. Reporting each one told
	// the agent its correct cell was "Unterminated string constant" — it went
	// looking for a bug in the tooling and built a second, colliding artifact.
	const { el } = await mount(BASE);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	el.streaming = true;
	await settle();
	el.beginTurn();
	// The prefixes a chunked `source` argument actually passes through, ending
	// on source that is perfectly valid.
	const chunks = [
		'"https://exam',
		'"https://example.com" + `x${',
		'"https://example.com" + `x${1}`',
	];
	for (const source of chunks) {
		el.applyAssistantPartial(assistant([{ type: "toolCall", id: "toolu_s", name: "cell", arguments: { source, id: "s" } }]));
		await settle(400); // a chunk lands, the sync runs — but the report must not
	}
	await settle(1400);
	await assertNoReportButWired(failures, el, "only the settled source counts, and it compiles");
	unmount(el);
});

test("half-written source that PARSES is not reported either", async () => {
	// The second half of the same regression, through the other door. A stream
	// that stops mid-identifier can leave source that is perfectly valid
	// JavaScript — `100 * normC` where the cell says `normCdf`. It compiles, so
	// the syntax gate never sees it; it runs, and throws `normC is not defined`.
	// That reached the agent as ground truth and cost it a turn renaming a
	// function to cure a bug that was never there.
	const { el } = await mount(BASE);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	el.streaming = true;
	await settle();
	el.beginTurn();
	const chunks = ["const pctOf = (z) => 100 * normC", "const pctOf = (z) => 100 * normCdf(z);\nconst normCdf = (z) => z;"];
	for (const source of chunks) {
		el.applyAssistantPartial(assistant([{ type: "toolCall", id: "toolu_r", name: "cell", arguments: { source, id: "r" } }]));
		await settle(600); // long enough for the graph to settle AND the sweep to fire
	}
	await settle(1000);
	await assertNoReportButWired(failures, el, "a truncated identifier is not a bug the agent should chase");
	unmount(el);
});

test("a settled cell that throws at runtime IS reported", async () => {
	// The gate must not swallow the real thing: once the message closes, whatever
	// the runtime says about that cell is the truth about it.
	const { el } = await mount(BASE);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	el.streaming = true;
	await settle();
	el.beginTurn();
	const msg = assistant([{ type: "toolCall", id: "toolu_x", name: "cell", arguments: { source: "missingThing + 1", id: "x" } }]);
	el.applyAssistantPartial(msg);
	el.finalizeAssistant(msg);
	await settle(1200);
	assert.equal(failures.length, 1, `expected one report, got ${JSON.stringify(failures)}`);
	assert.equal(failures[0].id, "x");
	assert.match(failures[0].error, /missingThing/);
	assert.equal(failures[0].scope, undefined, "one cell broke — addressed as that cell");
	unmount(el);
});

test("an artifact that runs clean and shows nothing says so", async () => {
	// The commonest empty page: every cell is a declaration, notebook-kit
	// autodisplays none of them, and the agent — which cannot see the page —
	// reports "renders a beautiful gradient card".
	const { el } = await mount(BASE);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	el.streaming = true;
	await settle();
	el.beginTurn();
	const msg = assistant([{ type: "toolCall", id: "toolu_d", name: "cell", arguments: { source: "const card = 1;", id: "d" } }]);
	el.applyAssistantPartial(msg);
	await settle(1000);
	// Asserted on a copy: `failures` keeps filling below, and narrowing the live
	// array to empty here would make the reads after it unreachable to the reader.
	assert.deepEqual([...failures], [], "a half-written artifact is all declarations until the display cell arrives");
	// The message closes: now the artifact is what the turn meant it to be.
	el.finalizeAssistant(msg);
	await settle(1000);
	assert.equal(failures.length, 1, `expected one report, got ${JSON.stringify(failures)}`);
	assert.match(failures[0].error, /displays nothing/);
	assert.ok(failures[0].scope, "addressed as the artifact, not as one of its cells");
	assert.ok(failures[0].key.endsWith("|blank"), "and keyed on something that survives a re-sweep");
	unmount(el);
});

test("an artifact that shows something is never reported", async () => {
	const { el } = await mount(BASE);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	el.streaming = true;
	await settle();
	el.beginTurn();
	// A declaration AND a bare expression that displays it — the correct shape.
	el.applyAssistantPartial(assistant([
			{ type: "toolCall", id: "toolu_a", name: "cell", arguments: { source: "const n = 1;", id: "a", group: "g" } },
			{ type: "toolCall", id: "toolu_b", name: "cell", arguments: { source: "n + 1", id: "b", group: "g" } },
		]));
	await settle(2200);
	await assertNoReportButWired(failures, el, "one member displaying is enough");
	unmount(el);
});

test("a redefinition mid-stream cannot vouch for its own half-written source", async () => {
	// The door the report storm came back through: `cellEls` holds ONE element
	// per id, but the document holds every definition. The superseded fence sits
	// behind the write head and looks settled — so it waved through the error
	// belonging to the partial being streamed right now.
	const { el } = await mount(BASE);
	const failures: CellFailure[] = [];
	el.addEventListener("cell-failure", (e) => failures.push((e as CustomEvent<CellFailure>).detail));
	el.streaming = true;
	await settle();
	// Turn one writes a good cell and finishes.
	const first = assistant([{ type: "toolCall", id: "toolu_r1", name: "cell", arguments: { source: "1 + 1", id: "r" } }]);
	el.beginTurn();
	el.applyAssistantPartial(first);
	el.finalizeAssistant(first);
	await settle(600);
	assert.deepEqual(failures, [], "a cell that compiles reports nothing");
	// Turn two streams a REDEFINITION of the same id, caught mid-string.
	el.applyAssistantPartial(assistant([{ type: "toolCall", id: "toolu_r2", name: "cell", arguments: { source: '"https://exam', id: "r" } }]));
	await settle(900);
	await assertNoReportButWired(failures, el, "the old definition's position must not settle the new one's error");
	unmount(el);
});

test("a block marker costs no vertical space", async () => {
	// `<!-- pi:block -->` is pure structure — it folds what follows into the block
	// above. Hiding only its text left the line standing plus the blank one
	// closing the segment, so every folded cell and every steered report punched
	// an unexplained ~44px hole in the page. Measured against the same document
	// without the marker: the marker must cost nothing.
	const answer = "Q\n\n<!-- pi -->\n\nA\n\n";
	const tail = "<!-- you -->\n\nnext\n\n<!-- you -->\n\n";
	const { el: plain } = await mount(answer + tail);
	await settle();
	const before = lines(plain).length;
	unmount(plain);

	const { el: folded } = await mount(`${answer}${BLOCK_MARKER}\n\n${tail}`);
	await settle();
	const rows = lines(folded);
	assert.equal(rows.length, before, "the marker adds no rendered line");
	assert.ok(!rows.some((r) => r.text.includes("pi:block")), "and never shows itself");
	unmount(folded);
});

test("an artifact edit mid-turn does not move the machine's region", async () => {
	// The user may edit an artifact at any point in the conversation, streaming
	// included — `setCellSource` carries `ownEdit`, so the filter that blocks
	// every other mid-stream edit lets it through by design. That edit lands
	// ABOVE the machine's region and shifts it. A host splicing at offsets it
	// measured before then writes into the wrong place: in `web-ebaa17a1` a tool
	// result's tail ended up 47000 characters from its marker, leaving a broken
	// fence behind. `streamRegion()` is the corrected answer hosts must splice
	// from.
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	el.streaming = true;
	el.beginTurn();
	await settle();
	// `detachStream` is the region, expressed as text: head is everything before
	// the machine's message, so its length is where the region starts.
	const before = el.detachStream();
	const cellAt = view.state.doc.toString().indexOf("const n = 1");
	assert.ok(cellAt >= 0 && cellAt < before.head.length, "the cell sits above the region");

	// Grow the cell by 20 characters, the way a pane edit or a widget write-back does.
	const grown = "const n = 1 // twenty!";
	assert.ok(el.setCellSource("aa", grown), "the edit is not blocked mid-turn");
	await settle();

	const after = el.detachStream();
	assert.equal(after.head.length - before.head.length, grown.length - "const n = 1".length, "the region moved by exactly the edit");
	assert.equal(after.current, before.current, "and the machine's own text is untouched");

	// And the machine's own splice still lands on the region, leaving the edit alone.
	el.applyAssistantPartial(assistant([{ type: "text", text: "still here" }]));
	await settle();
	const md = view.state.doc.toString();
	assert.ok(md.includes(grown), "the user's edit survived the splice");
	assert.ok(md.includes("still here"));
	assert.equal(md.indexOf(grown) < md.indexOf("still here"), true, "and nothing was relocated past it");
	unmount(el);
});

test("a document arriving from a mirror resets the cells of the one it replaces", async () => {
	// Switching sessions mid-run hands the document from the editor to a text
	// mirror and back. Splicing it in without clearing the registry left the
	// PREVIOUS session's artifacts parked and alive, so the page grew a second
	// widget answering to nothing — one turn, four artifacts, two of them ghosts.
	const { el } = await mount(ARTIFACT_DOC);
	await settle(600);
	assert.equal(el.querySelectorAll<PiArtifact>("pi-artifact").length, 1, "one artifact to start");

	// A different session's document arrives the way `openSession` delivers one.
	const other = ["ask elsewhere", "", "<!-- pi -->", "", "different page entirely", "", "<!-- you -->", "", ""].join("\n");
	el.attachStream({ head: other, current: "", tail: "" });
	await settle(600);

	assert.equal(el.querySelectorAll<PiArtifact>("pi-artifact").length, 0, "the old artifact did not survive the switch");
	assert.ok(el.view, "the switched-in document still has its editor");
	assert.ok(el.view.state.doc.toString().includes("different page entirely"));
	unmount(el);
});

test("a document re-read from the server keeps the cells and the caret", async () => {
	// The other half of the rule above. `setDocument` resets the registry because
	// a DIFFERENT document is arriving; `reconcileDocument` exists for the case
	// where the same one is — the host paints a session from the copy it already
	// holds so the switch lands in the click's own frame, then reconciles when
	// the file arrives. Resetting there would tear down a live artifact and throw
	// the caret to the end of the page for a change of one word.
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const artifact = el.querySelector<PiArtifact>("pi-artifact");
	assert.ok(artifact, "one artifact to start");

	// Put the caret somewhere a writer would care about: the first line.
	view.dispatch({ selection: { anchor: 4 } });
	const md = view.state.doc.toString();
	const server = md.replace("here it is", "here IT is");
	assert.notEqual(server, md, "the fixture must actually differ");

	el.reconcileDocument(server);
	await settle(600);

	assert.equal(view.state.doc.toString(), server, "the file's text won");
	assert.equal(view.state.selection.main.anchor, 4, "and the caret stayed where the writer left it");
	assert.equal(
		el.querySelector<PiArtifact>("pi-artifact"),
		artifact,
		"the very same element — a reset here would restart a Mandelbrot the reader had navigated into",
	);
	unmount(el);
});

test("setDocument, by contrast, replaces wholesale — it is the other document's path", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const artifact = el.querySelector<PiArtifact>("pi-artifact");
	assert.ok(artifact);
	view.dispatch({ selection: { anchor: 4 } });

	el.setDocument(view.state.doc.toString().replace("here it is", "here IT is"));
	await settle(600);

	assert.notEqual(el.querySelector<PiArtifact>("pi-artifact"), artifact, "the registry was reset");
	assert.equal(view.state.selection.main.anchor, view.state.doc.length, "and the caret is at the end");
	unmount(el);
});

test("the region a mirror hands back is the region the editor resumes", async () => {
	const { el } = await mount(BASE);
	await settle();
	const head = `${BASE.replace(/\s+$/, "")}\n\n`;
	const current = "<!-- pi -->\n\nhalf an answer\n\n";
	el.attachStream({ head, current, tail: "<!-- you -->\n\n" });
	await settle();
	const back = el.detachStream();
	assert.equal(back.head, head, "head survives the round trip");
	assert.equal(back.current, current, "and so does what the machine had written");
	// And the next partial replaces exactly that, leaving the head alone.
	el.applyAssistantPartial(assistant([{ type: "text", text: "the whole answer" }]));
	await settle();
	const after = el.detachStream();
	assert.equal(after.head, head, "a partial never touches what is above it");
	assert.match(after.current, /the whole answer/);
	assert.ok(!after.current.includes("half an answer"), "it replaces, it does not append");
	unmount(el);
});

// --- a whole-document edit is an edit -----------------------------------
//
// The cell menu and the rail's block drag both hand back a whole new document,
// because the helpers that produce one (`moveBlockText`, `deleteCell`,
// `duplicateCell`, `setCellMode`) are pure string functions. That used to go
// in through `setDocument` — the LOAD path — which disposed the cell engine
// and annotated itself out of the undo history. So moving a block restarted
// every artifact on the page, and neither a mis-drop nor an accidental delete
// could be taken back.

test("a whole-document edit is undoable, and the artifacts in it keep running", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600); // the cell sync is debounced 300ms, and loads the engine
	const before = view.state.doc.toString();
	const frame = el.querySelector<PiArtifact>("pi-artifact");
	assert.ok(frame, "the document rendered an artifact frame");
	const live = new Map(frame.members.map((m) => [m.id, m.cell]));
	assert.equal(live.size, 2, "two live cells to lose");

	// An edit somewhere else entirely — the case where losing them is absurd.
	const next = before.replace("that is the answer", "that was the answer");
	el.replaceDocument(next);
	await settle(600);

	assert.equal(view.state.doc.toString(), next, "the edit landed");
	const after = el.querySelector<PiArtifact>("pi-artifact");
	assert.ok(after, "and still one after the edit");
	for (const m of after.members)
		assert.equal(m.cell, live.get(m.id), `cell #${m.id} is the same element — the engine was never disposed`);

	undo(view);
	await settle(400);
	assert.equal(view.state.doc.toString(), before, "and ⌘Z takes the whole edit back");
	unmount(el);
});

test("replacing a document with itself dispatches nothing", async () => {
	const { el, view } = await mount(ARTIFACT_DOC);
	await settle(600);
	const before = view.state.doc.toString();
	el.replaceDocument(before);
	await settle();
	assert.equal(view.state.doc.toString(), before);
	// An empty transaction would still push an undo step, and ⌘Z would appear
	// to do nothing once before it started working.
	undo(view);
	await settle();
	assert.equal(view.state.doc.toString(), before, "no empty step went onto the history");
	unmount(el);
});

// --- one set of folds, and all of them ride edits ------------------------
//
// Fold state used to live in three fields, and only two of them mapped their
// offsets through document changes. `toggledFolds` — thinking blocks and
// activity runs — did not, so an expanded one silently re-collapsed the moment
// anything above it grew. While a reply streams in above you, that is constant.

const THINKING_DOC = [
	"<!-- you -->",
	"",
	"why?",
	"",
	"<!-- pi:thinking -->",
	"",
	"because the offsets drift",
	"",
	"<!-- pi -->",
	"",
	"answer",
	"",
	"<!-- you -->",
	"",
	"",
].join("\n");

test("an expanded fold stays expanded when the text above it grows", async () => {
	const { el, view } = await mount(THINKING_DOC);
	await settle();
	const shown = () => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n");
	const key = `thinking@${view.state.doc.toString().indexOf("<!-- pi:thinking -->")}`;

	assert.ok(!shown().includes("because the offsets drift"), "thinking folds by default");
	el.dispatchEvent(new CustomEvent("fold-toggle", { detail: { key }, bubbles: true }));
	await settle();
	assert.ok(shown().includes("because the offsets drift"), "and opens when asked");

	await type(view, THINKING_DOC.indexOf("why?"), "so ");
	assert.ok(shown().includes("because the offsets drift"), "and is still open after an edit above it");
	unmount(el);
});

test("a block fold and a segment fold live in the same set without colliding", async () => {
	const { el, view } = await mount(THINKING_DOC);
	await settle();
	const shown = () => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n");
	const thinkingAt = view.state.doc.toString().indexOf("<!-- pi:thinking -->");
	el.dispatchEvent(new CustomEvent("fold-toggle", { detail: { key: `thinking@${thinkingAt}` }, bubbles: true }));
	await settle();
	assert.ok(shown().includes("because the offsets drift"));

	// Restoring host-persisted block folds must not disturb the segment folds
	// this session opened — they are nobody else's business.
	el.setBlockFolds([]);
	await settle();
	assert.ok(shown().includes("because the offsets drift"), "setBlockFolds left the thinking fold alone");
	unmount(el);
});

// --- the page ends in exactly one prompt slot ----------------------------
//
// "you block spamming" is on the TODO list, and the rule it would break is
// enforced in two places that have to agree: `trailingPromptRepair`, in a
// transaction filter, for anything the writer does; and `beginTurnAt`, which
// opens a turn and puts the next slot below it — the filter is off while a run
// streams, so the turn path cannot lean on it.
//
// They agree because they are one helper: the editor's `beginTurn` and the
// background mirror's `beginParts` both call `beginTurnAt`. This pins that, so
// the two cannot drift back apart.

test("every turn leaves exactly one trailing prompt slot", async () => {
	const { el, view } = await mount(emptyDocument("x"));
	await settle();
	const md = () => view.state.doc.toString();
	const trailingSlots = () => (md().match(/<!-- you -->\s*$/) ?? []).length;

	for (let turn = 1; turn <= 3; turn++) {
		await type(view, view.state.doc.length, `question ${turn}`);
		el.beginTurn();
		await settle();
		const msg = assistant([{ type: "text", text: `answer ${turn}` }]);
		el.applyAssistantPartial(msg);
		await settle();
		el.finalizeAssistant(msg);
		await settle();
		el.endTurn();
		await settle();
		assert.equal(trailingSlots(), 1, `turn ${turn} ends in one slot, not a stack of them`);
		assert.equal((md().match(/^<!-- you -->$/gm) ?? []).length, turn + 1, `turn ${turn}: one marker per prompt`);
	}

	// A dead turn — the agent said nothing at all — must not leave two.
	await type(view, view.state.doc.length, "question 4");
	el.beginTurn();
	await settle();
	el.endTurn();
	await settle();
	assert.equal(trailingSlots(), 1, "a dead turn still ends in one slot");
	assert.ok(!md().includes("<!-- you -->\n\n<!-- you -->"), "and never two in a row");
	unmount(el);
});

test("a document that does not end in a prompt grows exactly one", async () => {
	// The shape a rebuilt or hand-written file arrives in: it ends with the
	// agent's reply and no slot at all. Nothing repairs it on load — the rule
	// runs for what the writer does — so the first keystroke has to.
	const ANSWERED = `---\npi: v1\nsession: x\n---\n\n<!-- you -->\n\nwhy?\n\n<!-- pi -->\n\nbecause\n`;
	const { el, view } = await mount(ANSWERED);
	await settle();
	assert.ok(!/<!-- you -->\s*$/.test(view.state.doc.toString()), "no slot to begin with");

	await type(view, view.state.doc.length, "!");
	const md = view.state.doc.toString();
	assert.match(md, /<!-- you -->\n\n$/, "one slot, at the end");
	assert.equal((md.match(/^<!-- you -->$/gm) ?? []).length, 2, "the sent prompt, and the new slot — no more");

	// And typing again does not stack a second one on top of it.
	await type(view, view.state.doc.length, "more");
	assert.equal((view.state.doc.toString().match(/^<!-- you -->$/gm) ?? []).length, 2, "still two");
	unmount(el);
});

// --- the `+` above an artifact is in a different gap --------------------
//
// An artifact frame is a block widget, not a `.cm-line`, so it carries none of
// the `doc-block-first` padding the `+` centres itself in — its top gap is
// `.doc-cell`'s own 0.75rem. Centred in the 2.5rem it does not have, the `+`
// sat on the frame's drag handle in the same left channel. The gap widget says
// which case it is; document.css does the arithmetic.

test("the gap above an artifact is marked as a frame gap; a cell's is not", async () => {
	const { el } = await mount(ARTIFACT_DOC);
	await settle(600); // the cell sync is debounced 300ms, and loads the engine
	const frame = el.querySelector<PiArtifact>("pi-artifact");
	assert.ok(frame, "the document has an artifact");

	const gaps = [...el.querySelectorAll(".doc-cell-gap")];
	assert.ok(gaps.length, "and the page offers insertion points");
	const frameGaps = gaps.filter((g) => g.classList.contains("doc-cell-gap-frame"));
	assert.equal(frameGaps.length, 1, "exactly one of them sits above the frame");

	// The handle it used to collide with is the frame's own, in the same
	// wrapper — which is what made them share a channel in the first place.
	const wrapper = frame.closest(".doc-cell");
	const grip = wrapper?.querySelector(".doc-cell-handle");
	assert.ok(grip, "the frame carries the grip");
	// Drawn, not typed: the glyph it used to be is not in the canvas's sans and fell
	// back to a braille font at 12px, which is why nobody could see it.
	assert.ok(grip.querySelector("svg"), "the grip is an icon, not a text glyph");
	unmount(el);
});

test("a plain cell's gap is not a frame gap", async () => {
	// A prompt cell renders as a line, so its gap really is the block gap.
	const { el } = await mount(withNote.md);
	await settle();
	const gaps = [...el.querySelectorAll(".doc-cell-gap")];
	assert.ok(gaps.length, "the note offers an insertion point");
	assert.equal(
		gaps.filter((g) => g.classList.contains("doc-cell-gap-frame")).length,
		0,
		"nothing here is a frame, so nothing claims the shorter gap",
	);
	unmount(el);
});

test("a gap declares the room it actually has, not the loose one", async () => {
	// The `+` centres itself in `--doc-gap-height`, so the widget has to know
	// which gap it is in. A follow-up prompt takes `doc-seg-first`'s 0.5rem, a
	// fifth of the block gap — and the `+` centred in 2.5rem it did not have
	// landed on that cell's own handle, the two rendering as one blob.
	const md = [
		"<!-- you -->", "", "chart it", "",
		"<!-- pi -->", "", "here you go", "",
		BLOCK_MARKER, "", "<!-- you -->", "", "and wider", "",
	].join("\n");
	const { el } = await mount(md);
	await settle();
	const kindOf = (g: Element) =>
		["block", "seg", "frame"].find((k) => g.classList.contains(`doc-cell-gap-${k}`)) ?? "(none)";
	const kinds = [...el.querySelectorAll(".doc-cell-gap")].map(kindOf);
	assert.ok(!kinds.includes("(none)"), `every gap names its kind, got ${kinds.join()}`);
	assert.equal(kinds.filter((k) => k === "seg").length, 1, "the ↳ you opens no block, so its gap is the tight one");
	assert.ok(kinds.includes("block"), "the opening prompt still takes the loose gap");
	unmount(el);
});

// --- and it is a drop target, not only a `+` ----------------------------
//
// The gap widget carries `beforeFrom`: the offset a cell dropped on it lands
// before, `null` meaning the end of the page. Frame gaps passed `null` — right
// while this widget only hosted the `+`, wrong once gaps started catching
// dragged cells. Between two adjacent artifacts the frame gaps are the ONLY
// gaps, so dragging the lower one above the upper one asked for "the end",
// which is where it already was: the reported "an artifact can't move on top of
// another artifact if they don't have anything in between".

/** Two artifacts, back to back, nothing between them. */
const TWO_FRAMES = [
	"draw two things",
	"",
	"<!-- pi -->",
	"",
	"here they are",
	"",
	"<!-- pi:artifact @alpha -->",
	"",
	"<!-- pi:cell js #aa -->",
	"",
	"```js",
	"const n = 1",
	"```",
	"",
	BLOCK_MARKER,
	"<!-- pi:artifact @beta -->",
	"",
	"<!-- pi:cell js #bb -->",
	"",
	"```js",
	"const m = 2",
	"```",
	"",
	"<!-- you -->",
	"",
].join("\n");

test("the gap above a frame drops before THAT frame, not at the end of the page", async () => {
	const { el } = await mount(TWO_FRAMES);
	await settle(600); // the cell sync is debounced 300ms, and loads the engine
	assert.equal(el.querySelectorAll<PiArtifact>("pi-artifact").length, 2, "two artifacts, back to back");

	const markers = parseDocument(TWO_FRAMES).segments.filter((s) => s.kind === "artifact");
	assert.equal(markers.length, 2);
	const frameGaps = [...el.querySelectorAll<HTMLElement>(".doc-cell-gap-frame")];
	assert.equal(frameGaps.length, 2, "one gap above each frame");
	assert.deepEqual(
		frameGaps.map((g) => g.dataset.beforeFrom),
		markers.map((m) => String(m.from)),
		"each names its own artifact's marker — `\"\"` here is the end-of-page sentinel",
	);
	unmount(el);
});

// --- deleting a block from the block menu -------------------------------
//
// The menu hands the whole new document to `replaceDocument`, so a delete is a
// splice like every other document edit: the page repairs its trailing slot on
// the same transaction, and ⌘Z brings the block back whole. That is why there
// is no confirmation dialog — asking permission for something the buffer can
// already take back is theatre.

const THREE_BLOCKS = [
	"<!-- you -->",
	"",
	"first",
	"",
	"<!-- pi -->",
	"",
	"one",
	"",
	"<!-- you -->",
	"",
	"second",
	"",
	"<!-- pi -->",
	"",
	"two",
	"",
	"<!-- you -->",
	"",
	"",
].join("\n");

test("deleting a block removes it, keeps a slot, and undoes whole", async () => {
	const { el, view } = await mount(THREE_BLOCKS);
	await settle();
	const before = view.state.doc.toString();
	const segs = parseDocument(before).segments;
	const block = blocksFrom(segs).find((b) => b.name === "first");
	assert.ok(block, "the page has the block we mean to delete");

	const deleted = deleteBlockText(before, blockKeyOf(segs, block));
	assert.ok(deleted, "the block delete is answered");
	el.replaceDocument(deleted);
	await settle();

	const after = view.state.doc.toString();
	assert.ok(!after.includes("first"), "the prompt went");
	assert.ok(!after.includes("one"), "and the reply under it");
	assert.ok(after.includes("second") && after.includes("two"), "the block below is untouched");
	assert.match(after, /<!-- you -->\s*$/, "the page still ends somewhere to write");

	undo(view);
	await settle();
	assert.equal(view.state.doc.toString(), before, "and one ⌘Z brings the whole block back");
	unmount(el);
});

test("deleting the only block leaves a writable page", async () => {
	const { el, view } = await mount(`<!-- you -->\n\nonly\n\n<!-- pi -->\n\nreply\n`);
	await settle();
	const segs = parseDocument(view.state.doc.toString()).segments;
	const block = blocksFrom(segs)[0];
	assert.ok(block, "the one-turn page has a block to delete");
	const emptied = deleteBlockText(view.state.doc.toString(), blockKeyOf(segs, block));
	assert.ok(emptied, "deleting the only block is answered");
	el.replaceDocument(emptied);
	await settle();
	const after = view.state.doc.toString();
	assert.ok(!after.includes("only") && !after.includes("reply"), "the page is empty of it");
	assert.match(after, /<!-- you -->\s*$/, "but not empty of somewhere to type");
	unmount(el);
});

// --- a turn opens where the prompt is, and leaves the caret there -----------
//
// A page can hold prompts in the middle of it, and two entrances start a turn
// at one: "answer this block" and the cell handle's run. Both used to drag the
// caret to the bottom of the page and leave it there for the whole turn —
// visible three ways at once, because the caret is also the iA-Writer focus
// paragraph and the rail's `current-block` highlight.
//
// The rule these pin: a turn moves the caret only when it opens at the END of
// the page, where the fresh slot it lays down is where you keep writing.

/** A page with an answered prompt in the middle and an empty slot at the end. */
const MID_PAGE = `<!-- you -->\n\nfirst question\n\n<!-- pi -->\n\nfirst answer\n\n<!-- you -->\n\nsecond question\n\n<!-- pi -->\n\nsecond answer\n\n<!-- you -->\n\n`;

/** The offset just past the text of the prompt whose body starts with `head` —
 *  what the host passes as `at`, via `promptEnd`. */
function promptTail(md: string, head: string) {
	const seg = parseDocument(md).segments.find((s) => s.kind === "user" && s.text.startsWith(head));
	assert.ok(seg, `no prompt starting "${head}"`);
	return seg.bodyFrom + md.slice(seg.bodyFrom, seg.to).replace(/\s+$/, "").length;
}

test("a mid-page turn leaves the caret in the prompt that ran", async () => {
	const { el, view } = await mount(MID_PAGE);
	await settle();
	const at = promptTail(view.state.doc.toString(), "second question");
	view.dispatch({ selection: { anchor: at } });
	await settle();

	el.beginTurn(at);
	await settle();
	assert.equal(view.state.selection.main.head, at, "the send does not move it");
	assert.notEqual(at, view.state.doc.length, "…and the end of the page is elsewhere");

	const msg = assistant([{ type: "text", text: "streamed reply" }]);
	el.applyAssistantPartial(msg);
	await settle();
	assert.equal(view.state.selection.main.head, at, "the reply growing below does not move it");

	el.finalizeAssistant(msg);
	await settle();
	el.endTurn();
	await settle();
	assert.equal(view.state.selection.main.head, at, "and the turn ending does not move it either");
	unmount(el);
});

test("a mid-page turn replaces the answer under its prompt", async () => {
	const { el, view } = await mount(MID_PAGE);
	await settle();
	const at = promptTail(view.state.doc.toString(), "second question");

	el.beginTurn(at);
	const msg = assistant([{ type: "text", text: "a better answer" }]);
	el.applyAssistantPartial(msg);
	await settle();
	el.finalizeAssistant(msg);
	await settle();
	el.endTurn();
	await settle();

	const md = view.state.doc.toString();
	assert.ok(md.includes("a better answer"), "the new answer is under the prompt");
	assert.ok(!md.includes("second answer"), "and the one it replaces is gone, not pushed down");
	assert.ok(md.includes("first answer"), "the block above is untouched");
	assert.equal((md.match(/^<!-- pi -->$/gm) ?? []).length, 2, "one reply per prompt, still");
	unmount(el);
});

test("a tail turn still moves the caret into the fresh prompt slot", async () => {
	const { el, view } = await mount(BASE);
	await settle();
	await type(view, view.state.doc.length, "a question");

	el.beginTurn();
	await settle();
	assert.equal(view.state.selection.main.head, view.state.doc.length, "the caret goes to the new slot");

	const msg = assistant([{ type: "text", text: "an answer" }]);
	el.applyAssistantPartial(msg);
	await settle();
	el.finalizeAssistant(msg);
	await settle();
	el.endTurn();
	await settle();
	assert.equal(view.state.selection.main.head, view.state.doc.length, "and stays at the end of the page");
	unmount(el);
});

test("typing in the tail during a mid-page turn still leaves the caret alone", async () => {
	const { el, view } = await mount(MID_PAGE);
	await settle();
	const at = promptTail(view.state.doc.toString(), "second question");
	el.streaming = true;
	el.beginTurn(at);
	await settle();

	// The writer goes on composing at the bottom while the reply lands above.
	await type(view, view.state.doc.length, "the next thing");
	const msg = assistant([{ type: "text", text: "streamed reply" }]);
	el.applyAssistantPartial(msg);
	await settle();
	el.finalizeAssistant(msg);
	await settle();
	const parked = view.state.selection.main.head;

	el.endTurn();
	await settle();
	el.streaming = false;
	assert.equal(view.state.selection.main.head, parked, "their own caret wins over both rules");
	unmount(el);
});

test("a mid-page turn does not rewrite the page below it", async () => {
	// A third block, so there is page BELOW the answer the re-run replaces —
	// text the turn has no business touching.
	const { el, view } = await mount(`${MID_PAGE.replace(/<!-- you -->\n\n$/, "")}<!-- you -->\n\nthird question\n\n<!-- pi -->\n\nthird answer\n\n<!-- you -->\n\n`);
	await settle();
	const before = view.state.doc.toString();
	const at = promptTail(before, "second question");
	// A caret below the turn rides the change rather than being replaced by it,
	// and that is only true while the splice stays minimal. Replacing everything
	// from the first difference to the end of the page — what this used to do —
	// collapses any position below it onto one end of the change.
	const below = before.indexOf("third answer") + "third ".length;
	view.dispatch({ selection: { anchor: below } });
	await settle();

	el.beginTurn(at);
	await settle();
	const after = view.state.doc.toString();
	const head = view.state.selection.main.head;
	assert.equal(head, below + (after.length - before.length), "it moved by exactly what the turn changed above it");
	assert.equal(after.slice(head - 6, head), "third ", "…which is to say, it is still in the same word");
	unmount(el);
});

test("the rail stays on the block being answered", async () => {
	const { el, view } = await mount(MID_PAGE);
	await settle();
	const at = promptTail(view.state.doc.toString(), "second question");
	view.dispatch({ selection: { anchor: at } });
	await settle();

	// `caret-block` is what the rail's current-block highlight mirrors.
	const keys: Array<string | null> = [];
	el.addEventListener("caret-block", (e) => keys.push((e as CustomEvent<CaretBlock>).detail.key));
	const segs = parseDocument(view.state.doc.toString()).segments;
	const last = blocksFrom(segs).at(-1);
	assert.ok(last, "the page has a trailing block");
	const opener = segs[last.opensAt];
	assert.ok(opener, "and the block names the segment that opens it");
	const lastKey = `user:${opener.from}`;

	el.beginTurn(at);
	await settle();
	const msg = assistant([{ type: "text", text: "streamed reply" }]);
	el.applyAssistantPartial(msg);
	await settle();
	el.finalizeAssistant(msg);
	await settle();
	el.endTurn();
	await settle();

	assert.ok(!keys.includes(lastKey), `the rail never jumped to the trailing block (saw ${JSON.stringify(keys)})`);
	unmount(el);
});

// -- the ⋯ that removes one segment -------------------------------------------
//
// Every head on the page can be addressed now, machine-written ones included.
// What is pinned here is the part that is easy to get wrong twice: the dots are
// a button INSIDE a head that already does something else, so the click must
// reach the menu and stop before the fold.

/** A page holding one of everything a machine turn writes. */
const MACHINE = [
	"<!-- you -->", "", "chart it", "",
	"<!-- pi:thinking -->", "", "weighing it up", "",
	"<!-- pi:tool bash #t1 -->", "", "```json", '{"cmd":"ls"}', "```", "",
	"<!-- pi -->", "", "here you go", "",
	"<!-- you -->", "",
].join("\n");

/** The `⋯` buttons on screen, keyed by the head they hang in. */
const segDots = (el: Element) =>
	[...el.querySelectorAll<HTMLElement>(".doc-seg-dots")].map((d) => ({
		el: d,
		head: (d.parentElement?.textContent ?? "").replace(/⋯/g, "").trim(),
	}));

test("every machine head carries a ⋯ that names its own segment", async () => {
	const { el, view } = await mount(MACHINE);
	await settle();
	const md = view.state.doc.toString();
	const dots = segDots(el);
	// `agent` is open prose; `thinking` and the tool call are folded by default and
	// render as one line each — both kinds of head get one.
	for (const head of ["agent", "thinking", "bash"])
		assert.ok(dots.some((d) => d.head.startsWith(head)), `no ⋯ on the ${head} head, saw ${JSON.stringify(dots.map((d) => d.head))}`);
	// And it addresses the segment it hangs in, not the block around it.
	const reply = dots.find((d) => d.head === "agent");
	assert.ok(reply, "the reply head carries a ⋯");
	const events: SegmentMenu[] = [];
	el.addEventListener("segment-menu", (e) => events.push((e as CustomEvent<SegmentMenu>).detail));
	reply.el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	assert.equal(events.length, 1);
	assert.equal(events[0].from, md.indexOf("<!-- pi -->"), "the ⋯ names the reply's own marker");
	unmount(el);
});

test("a folded step's ⋯ opens the menu and does not unfold it", async () => {
	// The dots used to BE the expand cue. They stop at the menu now, and the
	// label keeps the gesture — a click that did both would fold the page out
	// from under the menu that just opened.
	const { el } = await mount(MACHINE);
	await settle();
	const thinking = segDots(el).find((d) => d.head.startsWith("thinking"));
	assert.ok(thinking, "the thinking step is folded and has a ⋯");
	const seen: string[] = [];
	el.addEventListener("segment-menu", () => seen.push("menu"));
	el.addEventListener("fold-toggle", () => seen.push("fold"));
	thinking.el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	assert.deepEqual(seen, ["menu"], "the click reached the menu and stopped");

	// The label beside it still expands, which is what keeps nothing unreachable.
	seen.length = 0;
	const head = thinking.el.parentElement;
	assert.ok(head, "the ⋯ hangs in a head that is still there to click");
	head.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	assert.deepEqual(seen, ["fold"]);
	unmount(el);
});

test("a prompt that opens a block has no segment ⋯ — its head is the block's", async () => {
	// Two sets of dots on one line would say the same thing twice, and the
	// block's menu is the wider one. The narrow "delete the prompt, keep the
	// answer" lives in that prompt's own ⠿ menu instead.
	const { el } = await mount(MACHINE);
	await settle();
	assert.equal(segDots(el).filter((d) => d.head === "you").length, 0);
	unmount(el);
});

test("a follow-up folded into a block DOES get one — it opens no block of its own", async () => {
	const md = [
		"<!-- you -->", "", "chart it", "",
		"<!-- pi -->", "", "here you go", "",
		BLOCK_MARKER, "", "<!-- you -->", "", "and wider", "",
		"<!-- pi -->", "", "done", "",
		"<!-- you -->", "",
	].join("\n");
	const { el } = await mount(md);
	await settle();
	assert.equal(segDots(el).filter((d) => d.head.includes("you")).length, 1, "the ↳ you head, and only it");
	unmount(el);
});

test("a block head keeps its own ⋯ and does not grow a second", async () => {
	const { el } = await mount(MACHINE);
	await settle();
	const heads = [...el.querySelectorAll(".doc-role")].filter((h) => h.textContent.replace(/⋯/g, "").trim() === "you");
	// Both guards are load-bearing, and this test had neither: an empty `heads`
	// skipped the loop entirely, and `<= 1` is satisfied by zero — so deleting
	// the ⋯ feature outright left it green (docs/TEST_ARCHITECTURE.md §4).
	assert.equal(heads.length, 2, "the page's two prompts both render a head");
	for (const head of heads) assert.equal(head.querySelectorAll(".doc-role-dots").length, 1, "one line, one pair of dots");
	unmount(el);
});

test("a deleted segment comes back whole with ⌘Z", async () => {
	// The delete is a splice into the buffer, not a reload — which is the only
	// reason no dialog asks whether you meant it.
	const { el, view } = await mount(MACHINE);
	await settle();
	const before = view.state.doc.toString();
	const segments = parseDocument(before).segments;
	const reply = segments.findIndex((s) => s.kind === "assistant");
	const without = deleteSegment(before, segments, reply);
	assert.ok(without, "the segment delete is answered");
	el.replaceDocument(without);
	await settle();
	assert.ok(!view.state.doc.toString().includes("here you go"), "gone");
	undo(view);
	await settle();
	assert.equal(view.state.doc.toString(), before, "and back, character for character");
	unmount(el);
});

// -- where a structural edit leaves the reader ------------------------------------
//
// In a chat document the caret lives at the END of the file — every run parks it
// there — so an edit that scrolls the caret into view scrolls to the bottom of
// the page. That is right for an edit that MOVED the caret and wrong for one
// that spliced the document around a reader looking somewhere else: dropping a
// dragged cell threw the page off the thing you had just moved. jsdom has no
// layout, so what is asserted here is the transaction, which is where the
// decision is actually made.

// -- deleting a selection that spans blocks -------------------------------------
//
// The marker rule drops any change that clips a marker line, which is right for
// every accident and wrong for the one gesture that always does it: a selection
// dragged from the middle of one body to the middle of another. These pin the
// pair that answers it — the rule waving the change past, and the transaction
// filter putting the structural delete in its place — from the outside, at the
// four doors a selection replacement can come through.

/** A finished exchange with page prose under it, then the slot you type in. */
const SPANNED = [
	"<!-- you -->", "", "chart it", "",
	"<!-- pi -->", "", "here you go", "",
	"<!-- pi:note -->", "", "some prose", "",
	"<!-- you -->", "",
].join("\n");

/** The drag the writer makes: from inside the prompt to inside the reply. */
const acrossBlocks = () => ({ from: SPANNED.indexOf("chart it") + 5, to: SPANNED.indexOf("here you go") + 4 });

for (const event of ["delete.selection", "delete.cut"])
	test(`${event} across a marker deletes, where it used to do nothing`, async () => {
		const { el, view } = await mount(SPANNED);
		const { from, to } = acrossBlocks();
		view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: event });
		await settle();
		const md = view.state.doc.toString();
		assert.ok(md.includes("chart") && !md.includes("chart it"), "the prompt lost what was selected");
		assert.ok(md.includes("you go") && !md.includes("here you"), "and so did the reply");
		assert.ok(md.includes("<!-- pi -->"), "the reply keeps its head — the two halves never merge");
		assert.match(md, /<!-- you -->\n*$/, "the page still ends in a prompt slot");
		unmount(el);
	});

for (const [event, text] of [["input.type", "X"], ["input.paste", "everything"]])
	test(`${event} over a selection across a marker lands the text`, async () => {
		const { el, view } = await mount(SPANNED);
		const { from, to } = acrossBlocks();
		view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: event });
		await settle();
		const md = view.state.doc.toString();
		assert.ok(md.includes(`chart${text}`), "the text is at the junction");
		assert.ok(!md.includes("here you"), "and the span it replaced is gone");
		unmount(el);
	});

test("the keystroke reaches it: Backspace on a cross-marker selection is not a no-op", async () => {
	// No keystroke can be driven from CDP, and `defaultKeymap` is what turns
	// Backspace into the change — so the event has to be synthetic and real.
	const { el, view } = await mount(SPANNED);
	const { from, to } = acrossBlocks();
	view.dispatch({ selection: { anchor: from, head: to } });
	const before = view.state.doc.toString();
	view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", keyCode: 8, bubbles: true, cancelable: true }));
	await settle();
	assert.notEqual(view.state.doc.toString(), before, "the press changed the document");
	assert.ok(!view.state.doc.toString().includes("chart it"));
	unmount(el);
});

test("one undo takes the whole span back", async () => {
	const { el, view } = await mount(SPANNED);
	const before = view.state.doc.toString();
	const { from, to } = acrossBlocks();
	view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: "delete.selection" });
	await settle();
	assert.notEqual(view.state.doc.toString(), before);
	undo(view);
	await settle();
	assert.equal(view.state.doc.toString(), before, "one step, everything back");
	unmount(el);
});

test("a selection inside one body is left to the buffer, exactly as before", async () => {
	const { el, view } = await mount(SPANNED);
	const from = SPANNED.indexOf("here you go");
	view.dispatch({ changes: { from, to: from + 5 }, selection: { anchor: from }, userEvent: "delete.selection" });
	await settle();
	const md = view.state.doc.toString();
	assert.ok(md.includes("you go") && !md.includes("here "), "ordinary deletion, ordinary result");
	assert.ok(md.includes("chart it"), "and nothing structural happened");
	unmount(el);
});

test("a multi-range selection across markers is still refused", async () => {
	// Two spans would need two structural deletions composed against each
	// other's offsets. The old refusal is the right answer for a gesture this
	// rare; what must not happen is half of it going through.
	const { el, view } = await mount(SPANNED);
	const before = view.state.doc.toString();
	const a = SPANNED.indexOf("chart it") + 5;
	const b = SPANNED.indexOf("some prose") + 4;
	view.dispatch({
		changes: [
			{ from: a, to: SPANNED.indexOf("here you go") + 4 },
			{ from: b, to: b + 3 },
		],
		userEvent: "delete.selection",
	});
	await settle();
	assert.equal(view.state.doc.toString(), before, "all of it, or none");
	unmount(el);
});

test("mid-stream the machine's region is not something a drag can take", async () => {
	const { el, view } = await mount(SPANNED);
	el.streaming = true;
	await settle();
	const before = view.state.doc.toString();
	const { from, to } = acrossBlocks();
	view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: "delete.selection" });
	await settle();
	assert.equal(view.state.doc.toString(), before, "the reply being written is not editable");
	el.streaming = false;
	unmount(el);
});

// ── A write with no turn in flight is refused ────────────────────────────────
// The region rides doc changes like every other anchor here, so on a document
// loaded with no turn it had grown to span the whole buffer — `setDocument`
// inserts at 0 and the end maps forward. Every one of these three writes went
// through the same sink, which replaced that span: the conversation, gone, for
// an error pi reported after its turn was over (ADR 0017).

const SETTLED = "<!-- you -->\n\nwhat is 2+2\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\n";

test("an error reported with no turn in flight leaves the document alone", async () => {
	const { el, view } = await mount(SETTLED);
	const before = view.state.doc.toString();
	el.appendError("pi exited");
	await settle();
	assert.equal(view.state.doc.toString(), before, "nothing was in flight to replace");
	unmount(el);
});

test("a partial arriving with no turn in flight leaves the document alone", async () => {
	const { el, view } = await mount(SETTLED);
	const before = view.state.doc.toString();
	el.applyAssistantPartial(assistant([{ type: "text", text: "stray" }]));
	await settle();
	assert.equal(view.state.doc.toString(), before, "a chunk from a turn that ended lands nowhere");
	unmount(el);
});

test("a tool result arriving with no turn in flight leaves the document alone", async () => {
	const { el, view } = await mount(SETTLED);
	const before = view.state.doc.toString();
	el.appendToolResult({ role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "done" }], isError: false, timestamp: 0 });
	await settle();
	assert.equal(view.state.doc.toString(), before, "a result outliving its turn lands nowhere");
	unmount(el);
});

test("a turn that ends without a finalize still closes its region", async () => {
	const { el, view } = await mount(SETTLED);
	el.beginTurn();
	await settle();
	el.applyAssistantPartial(assistant([{ type: "text", text: "half an answer" }]));
	await settle();
	el.endTurn();
	await settle();
	const before = view.state.doc.toString();
	// The turn is over, and nothing finalized it — the path that used to leave
	// the region open over live text.
	el.appendError("connection dropped");
	await settle();
	assert.equal(view.state.doc.toString(), before, "the turn closed on endTurn, not on a finalize that never came");
	unmount(el);
});

test("endTurn clears the turn's flags rather than leaving them for the next one", async () => {
	const { el, view } = await mount(`${BASE}what now\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	await type(view, view.state.doc.toString().indexOf("what now"), "so, ");
	assert.equal(el.isHeadEdited, true, "text above the region is not in the transcript");

	el.streaming = false;
	el.endTurn();
	await settle();
	// The host reads this between turns to decide whether to drop its history
	// claim. It used to answer for the turn that had already ended, because only
	// the NEXT turn's splice cleared it.
	assert.equal(el.isHeadEdited, false, "the flag belonged to the turn that ended");
	unmount(el);
});

// ── Unmount is a lifetime, not a visibility change ───────────────────────────
// `disconnectedCallback` tore the cells down and left everything else running:
// three of six timers uncleared, and the `EditorView` never destroyed. So a
// debounced save fired into a document nobody was showing — and on a session
// switch, that is the OUTGOING document landing on the incoming session's save
// slot (ADR 0017's lesson, applied to lifetime rather than to the region).

test("a debounced save does not fire after the element is gone", async () => {
	const { el, view } = await mount(SETTLED);
	const seen: string[] = [];
	for (const name of ["doc-draft", "doc-change"]) el.addEventListener(name, () => seen.push(name));
	await type(view, view.state.doc.length, "x");
	unmount(el);
	// Past the longest of the two debounces this path arms.
	await settle(900);
	assert.deepEqual(seen, [], "the element was removed before either timer came due");
});

test("the editor is destroyed with the element, not left measuring", async () => {
	const { el, view } = await mount(SETTLED);
	unmount(el);
	await settle();
	// CodeMirror keeps its own window listeners and measure loop until `destroy`,
	// and none of that is observable from here. What is: `destroy` detaches the
	// view's DOM from its parent, where `remove()` on the element leaves the two
	// still joined. Asserting `isConnected` instead would pass with no teardown
	// at all, since removing the element disconnects its subtree either way.
	assert.equal(view.dom.parentNode, null, "the view let go of its own DOM");
});

// ── A new document's first state save is not suppressed by the last one's ────
// `#persistViewState` skips the emit when the payload matches what it last
// emitted, which is what stops a save loop. The memo outlived the document: two
// sessions whose cells carry the same state produce the same JSON, so the second
// one's save was suppressed and the host never learned it had state at all.
// Empty state cannot show this — the snapshot returns before the memo — so the
// cell below holds a real value.

const STATE_DOC = [
	"<!-- you -->",
	"",
	"count",
	"",
	"<!-- pi:cell js #st -->",
	"",
	"```js",
	"const n = state('n', 1)",
	"```",
	"",
	"<!-- you -->",
	"",
	"",
].join("\n");

test("a document replacing one with the same cell state still reports its own", async () => {
	const { el } = await mount(STATE_DOC);
	const saves: unknown[] = [];
	el.addEventListener("cell-state-save", (event) => saves.push((event as CustomEvent).detail));
	// The host answers "nothing saved for this session" each time; the cell sync
	// is debounced 300ms and loads the engine, hence the waits.
	el.cellState = null;
	await settle(900);
	el.setDocument(STATE_DOC);
	el.cellState = null;
	await settle(900);
	const before = saves.length;

	// A third session, same shape: its state matches what the memo last held.
	el.setDocument(STATE_DOC);
	el.cellState = null;
	await settle(900);

	assert.ok(saves.length > before, "the incoming document's state reached the host");
	unmount(el);
});

// ── The tail's position comes from the parse, not from marker arithmetic ─────
// `clearTail` derived it as `tailAnchor + YOU_MARKER.length + 2`, which assumes
// the text at the anchor is exactly `<!-- you -->\n\n`. Nothing checked it, and
// the delete runs to the end of the document — so a tail shaped any other way
// put the cut mid-draft and took the rest of the page with it. Views do not
// resolve document positions; `run.ts` does (docs/CODING_GUIDELINES.md).
//
// The caller is a queued message leaving the tail mid-turn, so the turn is
// live here.

test("clearTail cuts the queued draft and nothing above it", async () => {
	const { el, view } = await mount(`${BASE}ask this\n`);
	el.streaming = true;
	el.beginTurn();
	await settle();
	// The writer keeps typing in the tail while the reply streams, which is the
	// draft a queued send takes with it. Typed at the prompt's body offset, where
	// a writer's caret actually sits — appending at `doc.length` lands past the
	// trailing newline and both the old arithmetic and the parse agree there.
	const { segments } = parseDocument(view.state.doc.toString());
	await type(view, segments[tailPrompt(segments)].bodyFrom, "queued draft");
	el.clearTail();
	await settle();
	const after = view.state.doc.toString();
	assert.ok(after.includes("ask this"), "the prompt that ran is history, not draft");
	assert.ok(!after.includes("queued draft"), "the draft below the tail prompt is gone");
	// The trailing prompt itself survives the cut — it is where the next reply lands.
	assert.ok(after.trimEnd().endsWith("<!-- you -->"), "the page still ends in a prompt slot");
	el.streaming = false;
	unmount(el);
});

// A new conversation's file opens with frontmatter (`pi: v1`, `session: …`)
// that identifies it to Piary and to pi's rebuild. It is Piary's, not the
// user's — canvas edits already refuse it — so the canvas draws none of it:
// a new session showed `--- pi: v1 session: web-… ---` above its prompt.
test("a new conversation's frontmatter stays in the file but is not drawn", async () => {
	const md = emptyDocument("x");
	assert.ok(md.startsWith("---\npi: v1"), "the fixture is a document with frontmatter");
	const { el } = await mount(md);
	const rows = lines(el);
	const leaked = rows.filter((r) => /^---$|^pi: v1$|^session:/.test(r.text.trim()));
	assert.deepEqual(leaked, [], `frontmatter drawn on the canvas:\n${rows.map((r) => JSON.stringify(r.text)).join("\n")}`);
	assert.ok((el as unknown as DocumentChat).getDocument().startsWith("---\npi: v1"), "the file still carries it");
	unmount(el);
});
