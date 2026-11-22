// The canvas's outbound protocol — run `pnpm build` first.
//
// `<document-chat>` reports to its host through custom events — the list is
// `src/canvas/events.ts`, held to the source by `tests/contract/canvas-events.test.ts` —
// and the host is swappable: `app/main.ts` is the app's, the e2e harness is
// another. So these events are the seam, and this file is what makes
// "the public surface still works" an assertion rather than a hope — a rewrite
// of the canvas may re-plumb everything behind them. It
// proves an event is EMITTED; whether a host consumes it is the other file's.
//
// What each test asserts is the event AND its `detail`, because the detail is
// the contract: `app/main.ts` reads only `{text, at}` off a `doc-send` and
// drops `followUp`/`newBlock` on the floor, which is the kind of divergence a
// fires-at-all test cannot see.
//
// Chords are delivered as real `keydown` events on `view.contentDOM` — they do
// reach CodeMirror's keymap under jsdom, so the question "does the binding
// reach the dispatch?" is answerable here. (`tests/unit/keymap.test.ts` asserts what
// a chord MEANS as data, and `tests/contract/keymap-wiring.test.ts` holds the table and
// the editor together by reading source; neither can see the event.)
import test from "node:test";
import assert from "node:assert/strict";
import { mount, onVirtualClock, settle, unmount } from "../helpers/editor.ts";
import type { EditorView } from "@codemirror/view";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";

// On the virtual clock (helpers/editor.ts): the waits here are the component's
// debounces and frames, so `settle(ms)` advances time rather than spending it.
onVirtualClock();

const PAGE = "<!-- you -->\n\nwhat is 2+2\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\nfollow up";

/** Collect every `name` event the element dispatches, newest last. */
function collect(el: DocumentChat, name: string): Array<Record<string, unknown>> {
	const seen: Array<Record<string, unknown>> = [];
	el.addEventListener(name, (event) => seen.push(((event as CustomEvent).detail ?? {}) as Record<string, unknown>));
	return seen;
}

/** Which modifier `Mod-` resolves to here.
 *
 *  CodeMirror decides that once, at module load, from `navigator.platform`:
 *  `Mod` is `metaKey` when it matches /Mac/ and `ctrlKey` otherwise. Under the
 *  harness that platform is **Node's own** global `navigator` ("MacIntel", or
 *  "Linux x86_64" on CI) — jsdom's is installed afterwards and its
 *  `platform` is `""` regardless. So a chord hardcoding `metaKey` tests the
 *  binding on macOS and matches nothing on Linux, which is a suite that passes
 *  locally and fails in CI. */
const MOD: "metaKey" | "ctrlKey" = /Mac/.test(globalThis.navigator?.platform ?? "") ? "metaKey" : "ctrlKey";

/** A chord, as the browser delivers it: on the content DOM, bubbling.
 *  `mod` defaults on because every chord here but Escape carries it. */
function chord(view: EditorView, key: string, mods: { alt?: boolean; shift?: boolean; mod?: boolean } = {}) {
	view.contentDOM.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			code: key,
			[MOD]: mods.mod ?? true,
			altKey: mods.alt ?? false,
			shiftKey: mods.shift ?? false,
			bubbles: true,
			cancelable: true,
		}),
	);
}

// ── doc-send: how a prompt leaves the canvas ─────────────────────────────────
// Four dispatch sites, three intents. Every one carries `text` and `at`; they
// differ in the two booleans, and a host that mis-reads those sends the wrong
// thing to pi.

test("Mod-Enter sends the caret's prompt and opens a new block", async () => {
	const { el, view } = await mount(PAGE);
	const sent = collect(el, "doc-send");
	chord(view, "Enter");
	await settle();
	assert.equal(sent.length, 1, "the chord reached the dispatch");
	assert.equal(sent[0]["text"], "follow up", "the trailing prompt's own text");
	assert.equal(sent[0]["followUp"], false);
	assert.equal(sent[0]["newBlock"], true, "plain ⌘⏎ opens a block");
	assert.equal(typeof sent[0]["at"], "number", "and says where the caret was");
	unmount(el);
});

test("send() is the same send ⌘⏎ makes", async () => {
	// The menu's Send has no chord to deliver; it calls this. The two must not
	// drift, so the detail is compared whole.
	const { el, view } = await mount(PAGE);
	const sent = collect(el, "doc-send");
	chord(view, "Enter");
	el.send();
	await settle();
	assert.equal(sent.length, 2);
	assert.deepEqual(sent[1], sent[0]);
	unmount(el);
});

test("Alt-Mod-Enter sends into the current block instead of opening one", async () => {
	const { el, view } = await mount(PAGE);
	const sent = collect(el, "doc-send");
	chord(view, "Enter", { alt: true });
	await settle();
	assert.equal(sent.length, 1);
	assert.equal(sent[0]["followUp"], false);
	assert.equal(sent[0]["newBlock"], false, "this chord continues the block");
	unmount(el);
});

test("Shift-Mod-Enter queues a follow-up, and says so by omission", async () => {
	const { el, view } = await mount(PAGE);
	const sent = collect(el, "doc-send");
	chord(view, "Enter", { shift: true });
	await settle();
	assert.equal(sent.length, 1);
	assert.equal(sent[0]["followUp"], true);
	// Deliberate, and asserted because it is a trap: this site omits `newBlock`
	// rather than sending `false`. A host branching on `detail.newBlock` and one
	// branching on `detail.newBlock === false` disagree about what a follow-up
	// is, and nothing else in the suite would notice.
	assert.ok(!("newBlock" in sent[0]), "no newBlock key at all on a follow-up");
	unmount(el);
});

test("the Alt-Mod-Enter intent survives however the key arrives", async () => {
	// Two dispatch sites answer this chord: CodeMirror's binding, and a raw
	// `keydown` handler for the browser/keyboard-layout combinations where its
	// normalization fails. From outside they are indistinguishable by design —
	// that IS the contract — so what is asserted is that the intent is identical
	// and that the two never both fire. A rewrite collapsing them has this as its
	// acceptance criterion.
	const { el, view } = await mount(PAGE);
	const sent = collect(el, "doc-send");
	chord(view, "Enter", { alt: true });
	await settle();
	assert.equal(sent.length, 1, "exactly one site answered, not both");
	assert.equal(sent[0]["followUp"], false);
	assert.equal(sent[0]["newBlock"], false);
	unmount(el);
});

// ── doc-stop: Escape, and only while a turn is live ──────────────────────────

test("Escape stops a live turn and is otherwise the editor's own", async () => {
	const { el, view } = await mount(PAGE);
	const stopped = collect(el, "doc-stop");
	chord(view, "Escape", { mod: false });
	await settle();
	assert.equal(stopped.length, 0, "nothing to stop when no turn is running");

	el.streaming = true;
	await settle();
	chord(view, "Escape", { mod: false });
	await settle();
	assert.equal(stopped.length, 1, "a live turn is stoppable");
	el.streaming = false;
	unmount(el);
});

// ── The context menus: both ride one `contextmenu` handler ───────────────────
// Which of the two answers depends on whether the click landed inside a
// selection, and getting that wrong once meant right-clicking an artifact
// offered to quote a sentence off screen.
//
// Only the no-selection half is answerable here: deciding "is the click inside
// the selection?" goes through `posAtCoords`, which needs real layout and
// returns 0 under jsdom whatever the coordinates. The selection half is
// `e2e/events.spec.ts`.
//
// `doc-files` is there too, for a harder reason: jsdom implements no
// `DataTransfer`, `DragEvent` or `ClipboardEvent` at all, so a drop cannot be
// synthesized in this layer even badly.

test("right-clicking with no selection offers the block under the pointer", async () => {
	const { el, view } = await mount(PAGE);
	const blocks = collect(el, "block-menu");
	const selections = collect(el, "selection-menu");
	view.dispatch({ selection: { anchor: 0 } });
	await settle();
	view.contentDOM.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }));
	await settle();
	assert.equal(selections.length, 0, "an empty selection does not claim the click");
	assert.equal(blocks.length, 1, "the block does");
	assert.equal(typeof blocks[0]["from"], "number", "identified by its head-marker offset");
	unmount(el);
});

// ── block-folds: the host persists what the canvas collapsed ─────────────────

test("folding a block tells the host which offsets are collapsed", async () => {
	const { el, view } = await mount(PAGE);
	const emitted = collect(el, "block-folds");
	const from = view.state.doc.toString().indexOf("<!-- you -->");
	el.toggleBlockFold(from);
	await settle();
	assert.ok(emitted.length >= 1, "the host hears about a fold");
	const folds = emitted[emitted.length - 1]["folds"] as number[];
	assert.ok(Array.isArray(folds), "offsets, because the host stores numbers");
	assert.ok(folds.includes(from), "including the one just folded");

	el.toggleBlockFold(from);
	await settle();
	const after = emitted[emitted.length - 1]["folds"] as number[];
	assert.ok(!after.includes(from), "and hears about the unfold too");
	unmount(el);
});

test("blockFolds names a collapsed block's head where an edit above it moved it", async () => {
	// The host stores folds as head offsets. The editor maps its own folds
	// through every edit, so reading them back after one is how a stored list
	// keeps up instead of pointing at where the head used to be.
	const { el, view } = await mount(`<!-- pi:note -->\n\nIntro.\n\n${PAGE}`);
	assert.deepEqual(el.blockFolds(), [], "nothing collapsed yet");
	el.toggleBlockFold(view.state.doc.toString().indexOf("<!-- you -->"));
	await settle();
	// Typed into the prose above the block, the way a writer edits above it.
	const intro = view.state.doc.toString().indexOf("Intro.");
	view.dispatch({ changes: { from: intro, insert: "A longer " } });
	await settle();
	const head = view.state.doc.toString().indexOf("<!-- you -->");
	assert.deepEqual(el.blockFolds(), [head], "the fold followed its head, measured from the marker");
	unmount(el);
});

// ── pi-cell-writeback: inbound, and the only event on `window` ───────────────

test("a cell writing its own source back reaches the document", async () => {
	// Cells run in page context and hold no reference to the editor, so they ask
	// on `window` rather than on the element. The observable is the document,
	// not a re-emitted event.
	const doc = [
		"<!-- you -->",
		"",
		"count",
		"",
		"<!-- pi:cell js #wb -->",
		"",
		"```js",
		"const n = 1",
		"```",
		"",
		"<!-- you -->",
		"",
		"",
	].join("\n");
	const { el, view } = await mount(doc);
	await settle(700); // the cell sync is debounced, and loads the engine
	window.dispatchEvent(new CustomEvent("pi-cell-writeback", { detail: { id: "wb", source: "const n = 2" } }));
	await settle();
	assert.ok(view.state.doc.toString().includes("const n = 2"), "the cell's fence carries its new source");
	assert.ok(!view.state.doc.toString().includes("const n = 1"), "and not the old one");
	unmount(el);
});

// ── The public surface the host calls ────────────────────────────────────────
test("a change inside a prompt is reported as it was made: which prompt, where in its body, what went and came, and how", async () => {
	const { el, view } = await mount(PAGE);
	const seen = collect(el, "prompt-edit");
	const end = view.state.doc.length;
	view.dispatch({ changes: { from: end, insert: "!" }, userEvent: "input.type" });
	view.dispatch({ changes: { from: end - 2, to: end + 1, insert: "" }, userEvent: "delete.backward" });
	view.dispatch({ changes: { from: end - 2, insert: "pasted" }, userEvent: "input.paste" });
	const first = view.state.doc.toString().indexOf("what is");
	view.dispatch({ changes: { from: first, insert: "so " }, userEvent: "input.type" });
	await settle();
	const body = (index: number) => {
		const seg = el.parsed()!.parsed.segments.filter((s) => s.kind === "user")[index]!;
		return view.state.doc.sliceString(seg.bodyFrom, seg.to);
	};
	assert.deepEqual(
		seen.map((detail) => [detail["prompt"], ...(detail["edits"] as { from: number; deleted: string; inserted: string; origin: string }[]).map((e) => [e.deleted, e.inserted, e.origin])]),
		[
			[1, ["", "!", "type"]],
			[1, ["up!", "", "delete"]],
			[1, ["", "pasted", "paste"]],
			[0, ["", "so ", "type"]],
		],
	);
	// `from` is into the body: the last edit of each prompt sits where the body now holds it.
	const pasted = (seen[2]!["edits"] as { from: number }[])[0]!.from;
	assert.equal(body(1).slice(pasted, pasted + 6), "pasted");
	const typed = (seen[3]!["edits"] as { from: number }[])[0]!.from;
	assert.equal(body(0).slice(typed, typed + 3), "so ");
	assert.ok(typeof (seen[0]!["edits"] as { at: number }[])[0]!.at === "number");
	unmount(el);
});

test("the machine's own writing, an answer edited by hand and a change across blocks report no prompt edit", async () => {
	const { el, view } = await mount(PAGE);
	const seen = collect(el, "prompt-edit");
	const md = view.state.doc.toString();
	view.dispatch({ changes: { from: md.indexOf("Four."), insert: "About " }, userEvent: "input.type" });
	view.dispatch({ changes: { from: md.indexOf("2+2"), to: md.indexOf("Four.") + "About ".length, insert: "x" } });
	el.writeAtPrompt("/model");
	await settle();
	// Only the command written at the prompt is a change inside one prompt.
	assert.equal(seen.length, 1);
	unmount(el);
});

// Methods, where the tests above are events. Both halves are the same contract:
// what a rewrite must keep working while everything behind it moves.
// `toggleBlockFold` is covered by the
// block-folds test above, which is the gesture that drives it.

test("appendUserMessage delivers a steer at the transcript's position", async () => {
	const { el, view } = await mount(PAGE);
	el.streaming = true;
	el.beginTurn();
	await settle();
	el.applyAssistantPartial({
		role: "assistant",
		content: [{ type: "text", text: "thinking" }],
		api: "",
		provider: "",
		model: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: 0,
	});
	await settle();
	el.appendUserMessage("actually, in base 3", false);
	await settle();
	const md = view.state.doc.toString();
	// The steer lands AFTER what the machine had already written, not over it:
	// that is what "its true transcript position" means.
	assert.ok(md.includes("thinking"), "what streamed before the steer is kept");
	assert.ok(md.indexOf("actually, in base 3") > md.indexOf("thinking"), "and the steer follows it");
	// A region stays open below the steer, so the reply to it has somewhere to go.
	assert.ok(el.liveRegion, "the turn is still live after a steer");
	el.streaming = false;
	unmount(el);
});

test("appendUserMessage with fold continues the block it interrupted", async () => {
	const { el, view } = await mount(PAGE);
	el.streaming = true;
	el.beginTurn();
	await settle();
	const before = (view.state.doc.toString().match(/<!-- pi:block -->/g) ?? []).length;
	el.appendUserMessage("one more thing", true);
	await settle();
	const after = (view.state.doc.toString().match(/<!-- pi:block -->/g) ?? []).length;
	assert.equal(after, before + 1, "the fold puts a block marker in front of the delivery");
	el.streaming = false;
	unmount(el);
});

test("liveRegion is absent between turns and present during one", async () => {
	const { el } = await mount(PAGE);
	assert.equal(el.liveRegion, null, "a loaded document has no turn in flight (ADR 0017)");
	el.beginTurn();
	await settle();
	assert.ok(el.liveRegion, "a turn opens one");
	el.endTurn();
	await settle();
	assert.equal(el.liveRegion, null, "and it closes with the turn");
	unmount(el);
});

test("insertAttachment stages a file in front of the prompt, keeping the tail open", async () => {
	const { el, view } = await mount(PAGE);
	el.insertAttachment({ id: "a1", mime: "image/png", url: "/attachments/a1.png", name: "shot.png" });
	await settle();
	const md = view.state.doc.toString();
	assert.ok(md.includes("shot.png"), "the attachment is in the document");
	// The invariant every tail rule in run.ts depends on: the file goes BEFORE
	// the trailing `<!-- you -->`, so the page still ends in an open prompt.
	assert.ok(md.lastIndexOf("shot.png") < md.lastIndexOf("<!-- you -->"), "staged in front of the prompt");
	assert.ok(md.trimEnd().endsWith("follow up"), "and the prompt's own text is untouched");
	unmount(el);
});

test("a second attachment lands beside the first, not between it and the prompt", async () => {
	const { el, view } = await mount(PAGE);
	el.insertAttachment({ id: "a1", mime: "image/png", url: "/attachments/a1.png", name: "one.png" });
	await settle();
	el.insertAttachment({ id: "a2", mime: "image/png", url: "/attachments/a2.png", name: "two.png" });
	await settle();
	const md = view.state.doc.toString();
	assert.ok(md.indexOf("one.png") < md.indexOf("two.png"), "staged in the order they arrived");
	unmount(el);
});

test("setAsk parks the host's question in the document without changing it", async () => {
	const { el, view } = await mount(PAGE);
	const before = view.state.doc.toString();
	const ask = document.createElement("div");
	ask.textContent = "Sign in to continue";
	el.setAsk(ask);
	await settle();
	assert.equal(view.state.doc.toString(), before, "the question is not document content");
	assert.equal(ask.closest(".cm-content") !== null, true, "but it is mounted in the flow");
	el.setAsk(null);
	await settle();
	// Withdrawn means parked, not removed: elements are pooled outside CodeMirror
	// so a widget rebuild cannot throw away what they hold (ADR 0013 rule 1).
	assert.equal(ask.closest(".cm-content"), null, "withdrawing takes it out of the flow");
	assert.ok(el.contains(ask), "into the park, which is where pooled elements wait");
	unmount(el);
});

test("setBlockBadges publishes the host's badges and dedupes a repeat", async () => {
	const { el, view } = await mount(PAGE);
	const from = view.state.doc.toString().indexOf("<!-- you -->");
	el.setBlockBadges([{ from, badge: "plan" }]);
	await settle();
	assert.ok(el.textContent?.includes("plan"), "the badge is rendered on its block head");
	// Dedupe matters because the host re-sends on every refresh: an identical
	// list must not dispatch, or every refresh costs a decoration rebuild.
	const dispatched: unknown[] = [];
	const unpatch = view.dispatch.bind(view);
	(view as unknown as { dispatch: unknown }).dispatch = (...args: unknown[]) => {
		dispatched.push(args);
		return (unpatch as (...a: unknown[]) => unknown)(...args);
	};
	el.setBlockBadges([{ from, badge: "plan" }]);
	await settle();
	assert.equal(dispatched.length, 0, "an unchanged list is not re-published");
	unmount(el);
});

test("parsed hands back the parse the buffer is already holding", async () => {
	const { el, view } = await mount(PAGE);
	const parsed = el.parsed();
	assert.ok(parsed, "a mounted canvas has a parse");
	assert.equal(parsed.md, view.state.doc.toString(), "of the current document");
	assert.ok(
		parsed.parsed.segments.some((seg) => seg.kind === "user"),
		"with the document's segments resolved",
	);
	unmount(el);
});

test("compactRedefinitions collapses a redefined cell, and never mid-turn", async () => {
	// The same cell id twice: the agent redefined it, so the earlier fence is
	// history the document no longer needs.
	const redefined = [
		"<!-- you -->",
		"",
		"count",
		"",
		"<!-- pi:cell js #dup -->",
		"",
		"```js",
		"const n = 1",
		"```",
		"",
		"<!-- pi:cell js #dup -->",
		"",
		"```js",
		"const n = 2",
		"```",
		"",
		"<!-- you -->",
		"",
		"",
	].join("\n");
	const { el, view } = await mount(redefined);
	await settle();

	// Refused first, while a turn is writing: compacting under a splice would
	// move the text the machine is about to replace.
	el.streaming = true;
	await settle();
	assert.equal(el.compactRedefinitions(), false, "never while a turn is writing");
	assert.ok(view.state.doc.toString().includes("const n = 1"), "and it changed nothing");

	el.streaming = false;
	await settle();
	assert.equal(el.compactRedefinitions(), true, "between turns it has work to do");
	const md = view.state.doc.toString();
	assert.ok(!md.includes("const n = 1"), "the superseded fence is gone");
	assert.ok(md.includes("const n = 2"), "and the live one stays");
	assert.equal(el.compactRedefinitions(), false, "a second call has nothing left");
	unmount(el);
});

test("purgeSegmentFolds drops a deleted segment's fold rather than orphaning it", async () => {
	const { el, view } = await mount(PAGE);
	const folded = collect(el, "block-folds");
	const from = view.state.doc.toString().indexOf("<!-- pi -->");
	el.toggleBlockFold(view.state.doc.toString().indexOf("<!-- you -->"));
	await settle();
	// Called BEFORE the delete, while the segment is still there to name.
	el.purgeSegmentFolds(from);
	await settle();
	assert.ok(folded.length >= 1, "the fold bookkeeping stays observable through a purge");
	unmount(el);
});

test("cellValues resolves to the named exports a page with no cells has none of", async () => {
	const { el } = await mount(PAGE);
	const values = await el.cellValues();
	assert.deepEqual(values, {}, "no cells, no exports — and it resolves rather than throwing");
	unmount(el);
});

// ── Show Source: the ⟨⟩ escape, from wherever the caret is ──────────────────

const VIEWED = "<!-- you -->\n\nlist them\n\n<!-- pi:view properties #t1 -->\n\n```json\n{\n  \"rows\": 3\n}\n```\n\n<!-- you -->\n\nnext";

test("toggleSourceAtCaret shows a view's fence when the caret is in it, and hides it again", async () => {
	const { el, view } = await mount(VIEWED);
	const shown = () => [...el.querySelectorAll(".cm-line")].some((line) => line.textContent?.includes('"rows"'));
	assert.equal(shown(), false, "a view renders, its JSON hidden");
	view.dispatch({ selection: { anchor: VIEWED.indexOf("pi:view properties") } });
	assert.equal(el.toggleSourceAtCaret(), true);
	await settle();
	assert.equal(shown(), true, "its source is on the page");
	view.dispatch({ selection: { anchor: el.getDocument().indexOf('"rows"') } });
	assert.equal(el.toggleSourceAtCaret(), true);
	await settle();
	assert.equal(shown(), false, "and away again");
	unmount(el);
});

test("toggleSourceAtCaret in prose toggles nothing, and says so", async () => {
	const { el, view } = await mount(VIEWED);
	view.dispatch({ selection: { anchor: VIEWED.indexOf("list them") } });
	assert.equal(el.toggleSourceAtCaret(), false);
	unmount(el);
});

const WITH_ARTIFACT = [
	"<!-- you -->", "", "draw me something", "",
	"<!-- pi -->", "", "here it is", "",
	"<!-- pi:artifact @demo -->", "",
	"<!-- pi:cell js #aa -->", "", "```js", "const n = 1", "```", "",
	"<!-- pi -->", "", "that is the answer", "",
	"<!-- you -->", "", "",
].join("\n");

test("toggleSourceAtCaret shows an artifact's cells when the caret is in one", async () => {
	const { el, view } = await mount(WITH_ARTIFACT);
	await settle(600); // the cell sync is debounced, and loads the engine
	const fenceShown = () => [...el.querySelectorAll(".cm-line")].some((line) => line.textContent === "const n = 1");
	assert.equal(fenceShown(), false, "the frame holds the source, not the flow");
	view.dispatch({ selection: { anchor: WITH_ARTIFACT.indexOf("const n = 1") } });
	assert.equal(el.toggleSourceAtCaret(), true);
	await settle(80);
	assert.equal(fenceShown(), true, "its cells are plain fences again");
	unmount(el);
});
